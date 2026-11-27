import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { NotificationType } from '../schemas/notification.schema.js';

export class CreateNotificationDto {
  @IsOptional()
  @IsEnum(['notice', 'class', 'payment', 'student', 'system', 'attendance'])
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

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  actorRole?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetUserIds?: string[];

  @IsOptional()
  @IsString()
  targetBatch?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
