import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import {
  ClassStatus,
  ModuleStatus,
  NoticePriority,
  NoticeStatus,
  TxType,
} from '../enums/status.enum.js';
import { Transaction } from '../finance/schemas/transaction.schema.js';
import { CourseModule } from '../modules/schemas/module.schema.js';
import { Notice } from '../notices/schemas/notice.schema.js';
import { OnlineClass } from '../online-classes/schemas/online-class.schema.js';
import { Settings } from '../settings/schemas/settings.schema.js';
import { Student } from '../students/schemas/student.schema.js';
import { NotificationsService } from './notifications.service.js';
import { Notification } from './schemas/notification.schema.js';

function mockChain<T>(result: T) {
  return {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationModel: Record<string, ReturnType<typeof vi.fn>>;
  let noticeModel: Record<string, ReturnType<typeof vi.fn>>;
  let onlineClassModel: Record<string, ReturnType<typeof vi.fn>>;
  let studentModel: Record<string, ReturnType<typeof vi.fn>>;
  let moduleModel: Record<string, ReturnType<typeof vi.fn>>;
  let transactionModel: Record<string, ReturnType<typeof vi.fn>>;
  let settingsModel: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    notificationModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      updateOne: vi.fn(),
      updateMany: vi.fn(),
      deleteOne: vi.fn(),
      deleteMany: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 0 }) }),
    };
    noticeModel = { find: vi.fn() };
    onlineClassModel = { find: vi.fn() };
    studentModel = { find: vi.fn() };
    moduleModel = { find: vi.fn() };
    transactionModel = { find: vi.fn() };
    settingsModel = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getModelToken(Notification.name), useValue: notificationModel },
        { provide: getModelToken(Notice.name), useValue: noticeModel },
        { provide: getModelToken(OnlineClass.name), useValue: onlineClassModel },
        { provide: getModelToken(Student.name), useValue: studentModel },
        { provide: getModelToken(CourseModule.name), useValue: moduleModel },
        { provide: getModelToken(Transaction.name), useValue: transactionModel },
        { provide: getModelToken(Settings.name), useValue: settingsModel },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('aggregates persisted notifications, high-priority notices, upcoming classes, and overdue balances', async () => {
    notificationModel.find.mockReturnValue(
      mockChain([
        {
          id: 'notif_1',
          type: 'system',
          title: 'Welcome Admin',
          subtitle: 'System ready',
          link: '/dashboard',
          read: false,
          recipientId: null,
        },
      ]),
    );
    noticeModel.find.mockReturnValue(
      mockChain([
        {
          _id: 'abc123',
          title: 'Class Cancelled',
          priority: NoticePriority.HIGH,
          status: NoticeStatus.PUBLISHED,
          expiryDate: '2099-12-31',
        },
      ]),
    );
    onlineClassModel.find.mockReturnValue(
      mockChain([
        {
          id: 'cls_1',
          title: 'Physics Live',
          start: '2099-12-31T10:00',
          status: ClassStatus.SCHEDULED,
        },
      ]),
    );
    studentModel.find.mockReturnValue(
      mockChain([
        { id: 'STU-1', status: 'active', moduleIds: ['mod_1'] },
      ]),
    );
    moduleModel.find.mockReturnValue(
      mockChain([{ id: 'mod_1', fee: 150000, status: ModuleStatus.ACTIVE }]),
    );
    transactionModel.find.mockReturnValue(
      mockChain([
        {
          id: 'tx_1',
          type: TxType.INCOME,
          category: 'Tuition fees',
          studentId: 'STU-1',
          amount: 10000,
        },
      ]),
    );
    settingsModel.findOne.mockReturnValue(
      mockChain({
        notifications: {
          payments: true,
          overdue: true,
          absence: false,
          classes: true,
          notices: true,
        },
      }),
    );

    const res = await service.getNotifications();

    expect(res.items).toHaveLength(4);
    expect(res.unreadCount).toBe(4);
    expect(res.items.map((i) => i.type)).toEqual([
      'system',
      'notice',
      'class',
      'payment',
    ]);
  });

  it('generates notifications for student registered today and payment received today', async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    notificationModel.find.mockReturnValue(mockChain([]));
    noticeModel.find.mockReturnValue(mockChain([]));
    onlineClassModel.find.mockReturnValue(mockChain([]));
    studentModel.find.mockReturnValue(
      mockChain([
        {
          id: 'STU-99',
          fullName: 'John Doe',
          batch: '2026 A/L',
          enrollmentDate: today,
          status: 'active',
          moduleIds: [],
        },
      ]),
    );
    moduleModel.find.mockReturnValue(mockChain([]));
    transactionModel.find.mockReturnValue(
      mockChain([
        {
          id: 'tx_pay_today',
          type: TxType.INCOME,
          category: 'Tuition fees',
          studentId: 'STU-99',
          amount: 5000,
          date: today,
        },
      ]),
    );
    settingsModel.findOne.mockReturnValue(
      mockChain({
        notifications: {
          payments: true,
          overdue: false,
          absence: false,
          classes: false,
          notices: false,
        },
      }),
    );

    const res = await service.getNotifications();
    const studentNotif = res.items.find((i) => i.type === 'student');
    const paymentNotif = res.items.find((i) => i.id === 'pay_rec_tx_pay_today');

    expect(studentNotif).toBeDefined();
    expect(studentNotif?.title).toBe('New Student Registration: John Doe');
    expect(paymentNotif).toBeDefined();
    expect(paymentNotif?.title).toBe('Payment received: LKR 5,000');
  });

  it('creates, marks as read, marks all as read, and deletes notifications', async () => {
    notificationModel.create.mockResolvedValue({
      id: 'notif_new',
      type: 'system',
      title: 'Backup done',
      subtitle: 'Nightly',
      link: '/dashboard',
      read: false,
    });
    const created = await service.create({
      title: 'Backup done',
      subtitle: 'Nightly',
    });
    expect(created.title).toBe('Backup done');

    notificationModel.findOne.mockReturnValueOnce(
      mockChain({ id: 'notif_new', read: false }),
    );
    notificationModel.updateOne.mockReturnValue(mockChain({ modifiedCount: 1 }));
    expect(await service.markAsRead('notif_new')).toEqual({
      id: 'notif_new',
      read: true,
    });
    expect(notificationModel.updateOne).toHaveBeenCalledTimes(1);

    // Already read -> skips unnecessary DB update
    notificationModel.findOne.mockReturnValueOnce(
      mockChain({ id: 'notif_new', read: true }),
    );
    expect(await service.markAsRead('notif_new')).toEqual({
      id: 'notif_new',
      read: true,
    });
    expect(notificationModel.updateOne).toHaveBeenCalledTimes(1);

    // Dynamic notification -> creates read receipt
    notificationModel.findOne.mockReturnValueOnce(mockChain(null));
    notificationModel.create.mockResolvedValue({ id: 'ntc_1', read: true });
    expect(await service.markAsRead('ntc_1')).toEqual({
      id: 'ntc_1',
      read: true,
    });

    notificationModel.find.mockReturnValue(
      mockChain([{ id: 'notif_1', read: false, isReceipt: false }]),
    );
    noticeModel.find.mockReturnValue(mockChain([]));
    onlineClassModel.find.mockReturnValue(mockChain([]));
    studentModel.find.mockReturnValue(mockChain([]));
    moduleModel.find.mockReturnValue(mockChain([]));
    transactionModel.find.mockReturnValue(mockChain([]));
    settingsModel.findOne.mockReturnValue(mockChain(null));
    notificationModel.updateMany.mockReturnValue(
      mockChain({ modifiedCount: 1 }),
    );
    expect(await service.markAllAsRead()).toEqual({ updatedCount: 1 });

    notificationModel.deleteOne.mockReturnValue(mockChain({ deletedCount: 1 }));
    expect(await service.remove('notif_new')).toEqual({
      deleted: true,
      id: 'notif_new',
    });
  });

  it('throws NotFoundException when deleting missing notification', async () => {
    notificationModel.deleteOne.mockReturnValue(mockChain({ deletedCount: 0 }));
    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
  });
});
