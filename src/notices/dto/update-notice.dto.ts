import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NoticePriority, NoticeStatus } from '../../enums/status.enum.js';

export class UpdateNoticeDto {
  @ApiPropertyOptional({ description: 'Title of the notice' })
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'Enter a notice title' })
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the notice' })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Describe the notice (min 10 characters)' })
  description?: string;

  @ApiPropertyOptional({ description: 'Target batches (empty for all batches)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  batches?: string[];

  @ApiPropertyOptional({ description: 'Publish date in YYYY-MM-DD format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'publishDate must be a date' })
  publishDate?: string;

  @ApiPropertyOptional({ description: 'Expiry date in YYYY-MM-DD format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate must be a date' })
  expiryDate?: string;

  @ApiPropertyOptional({ enum: NoticePriority })
  @IsOptional()
  @IsEnum(NoticePriority)
  priority?: NoticePriority;

  @ApiPropertyOptional({ enum: NoticeStatus })
  @IsOptional()
  @IsEnum(NoticeStatus)
  status?: NoticeStatus;
}
