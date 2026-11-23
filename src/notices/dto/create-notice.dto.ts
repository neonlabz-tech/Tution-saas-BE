import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NoticePriority, NoticeStatus } from '../../enums/status.enum.js';

export const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimArray = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.trim() : v))
    : value;

export class CreateNoticeDto {
  @ApiProperty({ example: "Today's class has been cancelled" })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(4, { message: 'Title must be at least 4 characters' })
  @MaxLength(150, { message: 'Title must be at most 150 characters' })
  title: string;

  @ApiProperty({ example: 'The Physics class at 4 PM is cancelled due to rain.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  @MinLength(10, { message: 'Description must be at least 10 characters' })
  @MaxLength(5000, { message: 'Description must be at most 5000 characters' })
  description: string;

  @ApiPropertyOptional({
    description: 'Target every batch. When true, any `batches` sent are ignored and saved as [].',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'allBatches must be true or false' })
  allBatches?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Target batches. Required (at least one) unless allBatches is true.',
    example: ['2025-A Morning'],
  })
  @IsOptional()
  @Transform(trimArray)
  @IsArray({ message: 'Batches must be a list' })
  @ArrayUnique({ message: 'Batches must not repeat' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true, message: 'Batch name cannot be empty' })
  batches?: string[];

  @ApiProperty({ example: '2026-11-20', description: 'YYYY-MM-DD' })
  @IsString()
  @Matches(ISO_DATE_REGEX, { message: 'Publish date must be in YYYY-MM-DD format' })
  publishDate: string;

  @ApiProperty({ example: '2026-11-27', description: 'YYYY-MM-DD, on or after publishDate' })
  @IsString()
  @Matches(ISO_DATE_REGEX, { message: 'Expiry date must be in YYYY-MM-DD format' })
  expiryDate: string;

  @ApiPropertyOptional({ example: '23:59', description: 'HH:mm expiry time (24h), defaults to 23:59' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM_REGEX, { message: 'Expiry time must be in HH:mm format (00:00 - 23:59)' })
  expiryTime?: string;

  @ApiPropertyOptional({
    example: '2026-11-27T23:59:00.000Z',
    description: 'ISO-8601 expiry timestamp; computed from expiryDate + expiryTime if omitted',
  })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt must be a valid ISO-8601 timestamp' })
  expiresAt?: string;

  @ApiPropertyOptional({ enum: NoticePriority, default: NoticePriority.MEDIUM })
  @IsOptional()
  @IsEnum(NoticePriority, { message: 'Priority must be low, medium, or high' })
  priority?: NoticePriority;

  @ApiPropertyOptional({ enum: NoticeStatus, default: NoticeStatus.PUBLISHED })
  @IsOptional()
  @IsEnum(NoticeStatus, { message: 'Status must be published or draft' })
  status?: NoticeStatus;
}
