import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { NotificationType } from '../schemas/notification.schema.js';

export class CreateNotificationDto {
  @IsOptional()
  @IsEnum(['notice', 'class', 'payment', 'student', 'system'])
  type?: NotificationType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  link?: string;
}
