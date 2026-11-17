import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { AttendanceStatus } from '../../enums/status.enum.js';

export class BulkMarkUnmarkedDto {
  @ApiPropertyOptional({
    description: 'Attendance date (YYYY-MM-DD). Defaults to today.',
    example: '2026-11-17',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @ApiPropertyOptional({
    description: 'Target module ID or "all". If provided, only unmarked students in this module will be marked.',
    example: 'mod_61c16c50',
  })
  @IsOptional()
  @IsString()
  moduleId?: string;

  @ApiPropertyOptional({
    description: 'Target student batch or "all".',
    example: '2026 A/L',
  })
  @IsOptional()
  @IsString()
  batch?: string;

  @ApiPropertyOptional({
    description: 'Attendance status to apply to unmarked students',
    enum: AttendanceStatus,
    default: AttendanceStatus.PRESENT,
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({
    description: 'Method to record in attendance',
    enum: ['manual', 'qr'],
    default: 'manual',
  })
  @IsOptional()
  @IsString()
  method?: 'manual' | 'qr';
}
