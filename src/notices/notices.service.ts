import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';
import { Notice, type NoticeDocument } from './schemas/notice.schema.js';

export class NoticeDto extends CreateNoticeDto {
  id: string;
  declare batches: string[];
}

@Injectable()
export class NoticesService {
  constructor(
    @InjectModel(Notice.name)
    private readonly notices: Model<NoticeDocument>,
  ) {}

  async findAll(): Promise<NoticeDto[]> {
    const docs = await this.notices.find().sort({ publishDate: -1 }).exec();
    return docs.map((doc) => this.toDto(doc));
  }

  async findOne(id: string): Promise<NoticeDto> {
    const doc = await this.notices.findOne(this.buildIdFilter(id)).exec();
    if (!doc) {
      throw new NotFoundException('Notice not found');
    }
    return this.toDto(doc);
  }

  async create(dto: CreateNoticeDto): Promise<NoticeDto> {
    this.assertDates(dto.publishDate, dto.expiryDate);
    const created = await this.notices.create({
      ...dto,
      batches: dto.batches ?? [],
    });
    return this.toDto(created);
  }

  async update(id: string, dto: UpdateNoticeDto): Promise<NoticeDto> {
    const existing = await this.notices.findOne(this.buildIdFilter(id)).exec();
    if (!existing) {
      throw new NotFoundException('Notice not found');
    }

    const publishDate = dto.publishDate ?? existing.publishDate;
    const expiryDate = dto.expiryDate ?? existing.expiryDate;
    this.assertDates(publishDate, expiryDate);

    const updatePayload: Partial<Notice> = { ...dto };
    if (dto.batches !== undefined) {
      updatePayload.batches = dto.batches;
    }

    const updated = await this.notices
      .findOneAndUpdate(this.buildIdFilter(id), updatePayload, {
        returnDocument: 'after',
      })
      .exec();

    if (!updated) {
      throw new NotFoundException('Notice not found');
    }
    return this.toDto(updated);
  }

  async remove(id: string): Promise<{ deleted: boolean; id: string }> {
    const deleted = await this.notices
      .findOneAndDelete(this.buildIdFilter(id))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Notice not found');
    }
    return { deleted: true, id };
  }

  private buildIdFilter(id: string): Record<string, unknown> {
    if (isValidObjectId(id)) {
      return { $or: [{ _id: id }, { id }] };
    }
    return { id };
  }

  private assertDates(publishDate?: string, expiryDate?: string) {
    if (publishDate && expiryDate && expiryDate < publishDate) {
      throw new BadRequestException(
        'Expiry must be on or after the publish date',
      );
    }
  }

  private toDto(doc: NoticeDocument): NoticeDto {
    const dto = new NoticeDto();
    dto.id = (doc.id && !doc.id.startsWith('ObjectId')) ? doc.id : doc._id.toString();
    dto.title = doc.title;
    dto.description = doc.description ?? '';
    dto.batches = doc.batches ?? [];
    dto.publishDate = doc.publishDate;
    dto.expiryDate = doc.expiryDate;
    dto.priority = doc.priority;
    dto.status = doc.status;
    return dto;
  }
}
