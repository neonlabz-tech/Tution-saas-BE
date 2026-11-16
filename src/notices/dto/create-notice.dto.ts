import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NoticePriority, NoticeStatus } from '../../enums/status.enum.js';

export class CreateNoticeDto {
  @ApiProperty({ description: 'Title of the notice', example: "Today's class has been cancelled" })
  @IsString()
  @MinLength(4, { message: 'Enter a notice title' })
  title: string;

  @ApiProperty({ description: 'Detailed description of the notice', example: 'Due to unforeseen circumstances, the class is cancelled.' })
  @IsString()
  @MinLength(10, { message: 'Describe the notice (min 10 characters)' })
  description: string;

  @ApiPropertyOptional({ description: 'Target batches (empty for all batches)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  batches?: string[];

  @ApiProperty({ description: 'Publish date in YYYY-MM-DD format', example: '2026-11-16' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'publishDate must be a date' })
  publishDate: string;

  @ApiProperty({ description: 'Expiry date in YYYY-MM-DD format', example: '2026-11-23' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate must be a date' })
  expiryDate: string;

  @ApiProperty({ enum: NoticePriority, example: NoticePriority.MEDIUM })
  @IsEnum(NoticePriority)
  priority: NoticePriority;

  @ApiProperty({ enum: NoticeStatus, example: NoticeStatus.PUBLISHED })
  @IsEnum(NoticeStatus)
  status: NoticeStatus;
}
