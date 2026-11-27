import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { Role } from '../enums/role.enum.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
  ) {}

  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @Get()
  getNotifications() {
    return this.notificationsService.getNotifications();
  }

  @Post()
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @Patch('read-all')
  markAllAsRead() {
    return this.notificationsService.markAllAsRead();
  }

  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Delete(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }
}
