import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  ClassStatus,
  NoticePriority,
  NoticeStatus,
  TxType,
} from '../enums/status.enum.js';
import {
  Transaction,
  type TransactionDocument,
} from '../finance/schemas/transaction.schema.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import {
  Notice,
  type NoticeDocument,
} from '../notices/schemas/notice.schema.js';
import {
  OnlineClass,
  type OnlineClassDocument,
} from '../online-classes/schemas/online-class.schema.js';
import {
  Settings,
  type SettingsDocument,
} from '../settings/schemas/settings.schema.js';
import { Student, type StudentDocument } from '../students/schemas/student.schema.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import {
  Notification,
  type NotificationDocument,
  type NotificationType,
} from './schemas/notification.schema.js';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  link: string;
  read: boolean;
  persisted: boolean;
}

type LeanNotice = Notice & { _id?: unknown };

const pad = (n: number) => String(n).padStart(2, '0');

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(dt: string): string {
  const [h, m] = dt.slice(11, 16).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m || 0)} ${ap}`;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Notice.name)
    private readonly noticeModel: Model<NoticeDocument>,
    @InjectModel(OnlineClass.name)
    private readonly onlineClassModel: Model<OnlineClassDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Settings.name)
    private readonly settingsModel: Model<SettingsDocument>,
  ) {}

  async getNotifications(): Promise<{
    items: NotificationItem[];
    unreadCount: number;
  }> {
    const now = new Date();
    const today = toISODate(now);
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 2);
    const soonDate = toISODate(soon);

    const [
      persisted,
      notices,
      classes,
      students,
      modules,
      transactions,
      settings,
    ] = await Promise.all([
      this.notificationModel
        .find()
        .sort({ createdAt: -1 })
        .limit(20)
        .lean<Notification[]>()
        .exec(),
      this.noticeModel.find().lean<LeanNotice[]>().exec(),
      this.onlineClassModel.find().lean<OnlineClass[]>().exec(),
      this.studentModel.find().lean<Student[]>().exec(),
      this.moduleModel.find().lean<CourseModule[]>().exec(),
      this.transactionModel.find().lean<Transaction[]>().exec(),
      this.settingsModel.findOne({ key: 'default' }).lean<Settings>().exec(),
    ]);

    const prefs = settings?.notifications ?? {
      payments: true,
      overdue: true,
      absence: false,
      classes: true,
      notices: true,
    };

    const readIds = new Set(
      persisted.filter((n) => n.read).map((n) => n.id),
    );

    const items: NotificationItem[] = persisted
      .filter((n) => !n.isReceipt)
      .map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        subtitle: n.subtitle,
        link: n.link || '/dashboard/notices',
        read: n.read,
        persisted: true,
      }));

    const seenNoticeIds = new Set<string>();

    notices
      .filter(
        (n) =>
          n.status === NoticeStatus.PUBLISHED &&
          n.expiryDate >= today &&
          n.priority === NoticePriority.HIGH,
      )
      .slice(0, 2)
      .forEach((n) => {
        const nid = n.id || String(n._id ?? '');
        const itemId = `ntc_${nid}`;
        seenNoticeIds.add(nid);
        items.push({
          id: itemId,
          type: 'notice',
          title: n.title,
          subtitle:
            n.expiryDate === today
              ? 'High priority · Expires today'
              : 'High priority notice',
          link: '/dashboard/notices',
          read: readIds.has(itemId),
          persisted: false,
        });
      });

    if (prefs.notices) {
      notices
        .filter(
          (n) =>
            n.status === NoticeStatus.PUBLISHED &&
            n.expiryDate >= today &&
            n.expiryDate <= soonDate,
        )
        .slice(0, 3)
        .forEach((n) => {
          const nid = n.id || String(n._id ?? '');
          if (seenNoticeIds.has(nid)) return;
          seenNoticeIds.add(nid);
          const itemId = `ntc_exp_${nid}`;
          items.push({
            id: itemId,
            type: 'notice',
            title: n.title,
            subtitle:
              n.expiryDate === today
                ? 'Notice expires today'
                : `Notice expires on ${n.expiryDate}`,
            link: '/dashboard/notices',
            read: readIds.has(itemId),
            persisted: false,
          });
        });
    }

    if (prefs.classes) {
      classes
        .filter(
          (c) =>
            c.status === ClassStatus.SCHEDULED &&
            c.start.slice(0, 10) >= today,
        )
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, 2)
        .forEach((c) => {
          const dayLabel =
            c.start.slice(0, 10) === today ? 'Today' : c.start.slice(5, 10);
          const itemId = `cls_${c.id}`;
          items.push({
            id: itemId,
            type: 'class',
            title: c.title,
            subtitle: `${dayLabel} · ${fmtTime(c.start)}`,
            link: '/dashboard/online-classes',
            read: readIds.has(itemId),
            persisted: false,
          });
        });
    }

    if (prefs.overdue) {
      const feeMap = new Map(modules.map((m) => [m.id, m.fee]));
      const paidMap = new Map<string, number>();
      for (const tx of transactions) {
        if (
          tx.type === TxType.INCOME &&
          tx.category === 'Tuition fees' &&
          tx.studentId
        ) {
          paidMap.set(
            tx.studentId,
            (paidMap.get(tx.studentId) ?? 0) + tx.amount,
          );
        }
      }

      let owingCount = 0;
      for (const s of students) {
        if (s.status !== 'active') continue;
        const feeTotal = s.moduleIds.reduce(
          (sum, id) => sum + (feeMap.get(id) ?? 0),
          0,
        );
        const outstanding = Math.max(0, feeTotal - (paidMap.get(s.id) ?? 0));
        if (outstanding > 100000) owingCount += 1;
      }

      if (owingCount > 0) {
        const itemId = 'pay_overdue';
        items.push({
          id: itemId,
          type: 'payment',
          title: `${owingCount} students have large outstanding balances`,
          subtitle: 'Finance reminder',
          link: '/dashboard/finance',
          read: readIds.has(itemId),
          persisted: false,
        });
      }
    }

    students
      .filter((s) => s.enrollmentDate === today)
      .slice(0, 5)
      .forEach((s) => {
        const itemId = `stu_reg_${s.id}`;
        items.push({
          id: itemId,
          type: 'student',
          title: `New Student Registration: ${s.fullName}`,
          subtitle: `Enrolled today · ${s.batch || 'Batch'}`,
          link: '/dashboard/students',
          read: readIds.has(itemId),
          persisted: false,
        });
      });

    if (prefs.payments) {
      const studentNameMap = new Map(students.map((s) => [s.id, s.fullName]));
      transactions
        .filter((tx) => tx.type === TxType.INCOME && tx.date === today)
        .slice(0, 5)
        .forEach((tx) => {
          const itemId = `pay_rec_${tx.id}`;
          const sName = tx.studentId ? studentNameMap.get(tx.studentId) : null;
          items.push({
            id: itemId,
            type: 'payment',
            title: `Payment received: LKR ${tx.amount.toLocaleString()}`,
            subtitle: sName
              ? `${sName} · ${tx.category || 'Tuition fees'}`
              : tx.description || tx.category || 'Tuition payment',
            link: '/dashboard/finance',
            read: readIds.has(itemId),
            persisted: false,
          });
        });
    }

    const unreadCount = items.filter((i) => !i.read).length;
    return { items, unreadCount };
  }

  async create(dto: CreateNotificationDto): Promise<NotificationItem> {
    const id = `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const created = await this.notificationModel.create({
      id,
      type: dto.type ?? 'system',
      title: dto.title.trim(),
      subtitle: (dto.subtitle ?? '').trim(),
      link: dto.link ?? '/dashboard/notices',
      read: false,
      recipientId: null,
    });

    return {
      id: created.id,
      type: created.type,
      title: created.title,
      subtitle: created.subtitle,
      link: created.link,
      read: created.read,
      persisted: true,
    };
  }

  async markAsRead(id: string): Promise<{ id: string; read: true }> {
    const existing = await this.notificationModel
      .findOne({ id })
      .lean<Notification>()
      .exec();

    if (existing?.read) {
      return { id: existing.id, read: true };
    }

    if (existing) {
      await this.notificationModel
        .updateOne({ id }, { $set: { read: true } })
        .exec();
      return { id: existing.id, read: true };
    }

    const type: NotificationType = id.startsWith('cls_')
      ? 'class'
      : id.startsWith('pay_')
        ? 'payment'
        : id.startsWith('stu_')
          ? 'student'
          : id.startsWith('ntc_') || id.startsWith('local_exp_')
            ? 'notice'
            : 'system';

    await this.notificationModel.create({
      id,
      type,
      title: id,
      subtitle: '',
      link: '/dashboard/notices',
      read: true,
      isReceipt: true,
      recipientId: null,
    });

    return { id, read: true };
  }

  async markAllAsRead(): Promise<{ updatedCount: number }> {
    const { items } = await this.getNotifications();
    const unreadItems = items.filter((i) => !i.read);
    if (unreadItems.length === 0) {
      return { updatedCount: 0 };
    }

    const res = await this.notificationModel
      .updateMany({ read: false }, { $set: { read: true } })
      .exec();

    const dynamicUnread = unreadItems.filter((i) => !i.persisted);
    if (dynamicUnread.length > 0) {
      await Promise.all(
        dynamicUnread.map((item) =>
          this.notificationModel
            .updateOne(
              { id: item.id },
              {
                $setOnInsert: {
                  id: item.id,
                  type: item.type,
                  title: item.title,
                  subtitle: item.subtitle,
                  link: item.link,
                  isReceipt: true,
                  recipientId: null,
                },
                $set: { read: true },
              },
              { upsert: true },
            )
            .exec(),
        ),
      );
    }

    return { updatedCount: (res.modifiedCount ?? 0) + dynamicUnread.length };
  }

  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const res = await this.notificationModel.deleteOne({ id }).exec();
    if (!res.deletedCount) {
      throw new NotFoundException(`Notification "${id}" not found`);
    }
    return { deleted: true, id };
  }
}
