import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class StudentHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Filter history on or after this date (YYYY-MM-DD)',
    example: '2026-11-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from date must be in YYYY-MM-DD format',
  })
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter history on or before this date (YYYY-MM-DD)',
    example: '2026-11-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to date must be in YYYY-MM-DD format',
  })
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter history by specific module ID or "all"',
    example: 'mod_61c16c50',
  })
  @IsOptional()
  @IsString()
  moduleId?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of history records to return',
    default: 100,
    example: 60,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
