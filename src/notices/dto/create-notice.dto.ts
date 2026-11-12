import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { NoticePriority, NoticeStatus } from '../../enums/status.enum.js';

export class CreateNoticeDto {
  @IsString()
  @MinLength(4, { message: 'Enter a notice title' })
  title: string;

  @IsString()
  @MinLength(10, { message: 'Describe the notice (min 10 characters)' })
  description: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  batches?: string[];

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'publishDate must be a date' })
  publishDate: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate must be a date' })
  expiryDate: string;

  @IsEnum(NoticePriority)
  priority: NoticePriority;

  @IsEnum(NoticeStatus)
  status: NoticeStatus;
}
