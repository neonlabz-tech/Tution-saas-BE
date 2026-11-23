import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NoticePriority, NoticeState } from '../../enums/status.enum.js';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === 'all' ? undefined : value;

/** Expired notices are never listed, so they are not a filter option. */
const STATE_FILTERS = [NoticeState.ACTIVE, NoticeState.SCHEDULED, NoticeState.DRAFT] as const;

export class QueryNoticeDto {
  @ApiPropertyOptional({
    enum: STATE_FILTERS,
    description: 'Computed state filter. active = published and live.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(STATE_FILTERS, { message: 'State must be active, scheduled, or draft' })
  state?: (typeof STATE_FILTERS)[number];

  @ApiPropertyOptional({ enum: NoticePriority })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(NoticePriority, { message: 'Priority must be low, medium, or high' })
  priority?: NoticePriority;

  @ApiPropertyOptional({
    description:
      'Batch name. Matches notices targeting that batch plus "All batches" notices.',
    example: '2025-A Morning',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  batch?: string;

  @ApiPropertyOptional({ description: 'Search title or description' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;
}
