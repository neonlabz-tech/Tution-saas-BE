import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import type { Model } from 'mongoose';
import {
  Notification,
  type NotificationDocument,
} from '../notifications/schemas/notification.schema.js';
import { ClassStatus, ClassType } from '../enums/status.enum.js';
import { CreateOnlineClassDto } from './dto/create-online-class.dto.js';
import { QueryOnlineClassDto } from './dto/query-online-class.dto.js';
import { UpdateOnlineClassDto } from './dto/update-online-class.dto.js';
import {
  OnlineClass,
  type OnlineClassDocument,
} from './schemas/online-class.schema.js';

@Injectable()
export class OnlineClassesService {
  private readonly logger = new Logger(OnlineClassesService.name);

  constructor(
    @InjectModel(OnlineClass.name)
    private readonly onlineClassModel: Model<OnlineClassDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async findAll(query?: QueryOnlineClassDto): Promise<OnlineClass[]> {
    const filter: Record<string, unknown> = {};

    if (query?.teacherId && query.teacherId !== 'all') {
      filter.teacherId = query.teacherId;
    }
    if (query?.moduleId && query.moduleId !== 'all') {
      filter.moduleId = query.moduleId;
    }
    if (query?.batch && query.batch !== 'all') {
      filter.batch = query.batch;
    }
    if (query?.status) {
      filter.status = query.status;
    }
    if (query?.classType && query.classType !== 'all') {
      filter.classType = query.classType;
    }

    if (query?.from || query?.to) {
      const startFilter: Record<string, string> = {};
      if (query.from) {
        startFilter.$gte = query.from;
      }
      if (query.to) {
        startFilter.$lte = query.to;
      }
      filter.start = startFilter;
    }

    if (query?.q) {
      const q = query.q.trim();
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { title: regex },
        { batch: regex },
        { link: regex },
        { hall: regex },
      ];
    }

    return this.onlineClassModel
      .find(filter)
      .sort({ start: 1 })
      .lean<OnlineClass[]>()
      .exec();
  }

  async findById(id: string): Promise<OnlineClass> {
    const onlineClass = await this.onlineClassModel
      .findOne({ id })
      .lean<OnlineClass>()
      .exec();

    if (!onlineClass) {
      throw new NotFoundException(`Online class with ID "${id}" not found`);
    }

    return onlineClass;
  }

  async create(dto: CreateOnlineClassDto): Promise<OnlineClass> {
    this.validateStartEnd(dto.start, dto.end);

    const classType = dto.classType ?? ClassType.ONLINE;
    if (classType === ClassType.ONLINE && !dto.link?.trim()) {
      throw new BadRequestException('Meeting link is required for online classes');
    }
    if (classType === ClassType.PHYSICAL && !dto.hall?.trim()) {
      throw new BadRequestException('Hall name is required for physical classes');
    }

    const id = `cls_${Date.now()}_${randomBytes(4).toString('hex')}`;

    const created = await this.onlineClassModel.create({
      id,
      title: dto.title.trim(),
      classType,
      hall: dto.hall?.trim() ?? '',
      moduleId: dto.moduleId.trim(),
      teacherId: dto.teacherId.trim(),
      batch: dto.batch.trim(),
      start: dto.start.trim(),
      end: dto.end.trim(),
      link: dto.link?.trim() ?? '',
      description: dto.description?.trim() ?? '',
      status: dto.status ?? ClassStatus.SCHEDULED,
    });

    const saved: OnlineClass =
      typeof created.toObject === 'function'
        ? (created.toObject() as OnlineClass)
        : (created as unknown as OnlineClass);

    // Create automated notification for scheduled class
    try {
      if (typeof this.notificationModel?.create === 'function') {
        const notifId = `notif_cls_${Date.now()}_${randomBytes(3).toString('hex')}`;
        const locSub =
          saved.classType === ClassType.PHYSICAL && saved.hall
            ? `${saved.batch} · ${saved.hall} · ${saved.start.replace('T', ' ')}`
            : `${saved.batch} · ${saved.start.replace('T', ' ')}`;

        await this.notificationModel.create({
          id: notifId,
          type: 'class',
          title: `Class Scheduled: ${saved.title}`,
          subtitle: locSub,
          link: '/dashboard/online-classes',
          read: false,
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to create class notification: ${err}`);
    }

    return saved;
  }

  async update(id: string, dto: UpdateOnlineClassDto): Promise<OnlineClass> {
    const existing = await this.onlineClassModel.findOne({ id }).exec();
    if (!existing) {
      throw new NotFoundException(`Online class with ID "${id}" not found`);
    }

    const nextStart = dto.start ?? existing.start;
    const nextEnd = dto.end ?? existing.end;
    this.validateStartEnd(nextStart, nextEnd);

    // Protection: Prevent rescheduling classes that have already ended
    const now = new Date().toISOString();
    const isRescheduling = dto.start !== undefined || dto.end !== undefined;
    if (isRescheduling && existing.end < now) {
      throw new BadRequestException('Cannot reschedule a class that has already ended');
    }
    if (dto.end !== undefined && dto.end < now) {
      throw new BadRequestException('Cannot move class to a past time');
    }

    if (dto.title !== undefined) existing.title = dto.title.trim();
    if (dto.classType !== undefined) existing.classType = dto.classType;
    if (dto.hall !== undefined) existing.hall = dto.hall.trim();
    if (dto.moduleId !== undefined) existing.moduleId = dto.moduleId.trim();
    if (dto.teacherId !== undefined) existing.teacherId = dto.teacherId.trim();
    if (dto.batch !== undefined) existing.batch = dto.batch.trim();
    if (dto.start !== undefined) existing.start = dto.start.trim();
    if (dto.end !== undefined) existing.end = dto.end.trim();
    if (dto.link !== undefined) existing.link = dto.link.trim();
    if (dto.description !== undefined) existing.description = dto.description.trim();
    if (dto.status !== undefined) existing.status = dto.status;

    const saved = await existing.save();
    return typeof saved.toObject === 'function'
      ? (saved.toObject() as OnlineClass)
      : (saved as unknown as OnlineClass);
  }

  async delete(id: string): Promise<{ deleted: true; id: string }> {
    const res = await this.onlineClassModel.deleteOne({ id }).exec();
    if (res.deletedCount === 0) {
      throw new NotFoundException(`Online class with ID "${id}" not found`);
    }
    return { deleted: true, id };
  }

  private validateStartEnd(start: string, end: string): void {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
      throw new BadRequestException('Start and end must be valid date-time strings');
    }

    if (startTime >= endTime) {
      throw new BadRequestException(
        'Class start time must be before class end time',
      );
    }
  }
}
