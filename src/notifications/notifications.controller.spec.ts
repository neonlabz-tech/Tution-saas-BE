import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      getNotifications: vi.fn(),
      create: vi.fn(),
      markAllAsRead: vi.fn(),
      markAsRead: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('delegates all notification endpoints to NotificationsService', async () => {
    service.getNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
    service.create.mockResolvedValue({ id: 'notif_1' });
    service.markAllAsRead.mockResolvedValue({ updatedCount: 1 });
    service.markAsRead.mockResolvedValue({ id: 'notif_1', read: true });
    service.remove.mockResolvedValue({ deleted: true, id: 'notif_1' });

    expect(await controller.getNotifications()).toEqual({
      items: [],
      unreadCount: 0,
    });
    expect(await controller.create({ title: 'Hello' })).toEqual({
      id: 'notif_1',
    });
    expect(await controller.markAllAsRead()).toEqual({ updatedCount: 1 });
    expect(await controller.markAsRead('notif_1')).toEqual({
      id: 'notif_1',
      read: true,
    });
    expect(await controller.remove('notif_1')).toEqual({
      deleted: true,
      id: 'notif_1',
    });
  });
});
