import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AttendanceStatus } from '../../enums/status.enum.js';

export class QueryAttendanceDto {
  @ApiPropertyOptional({ description: 'Filter by student ID (STU-YYYY-NNN)' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Filter by course module ID' })
  @IsOptional()
  @IsString()
  moduleId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: AttendanceStatus,
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({ description: 'Filter records on or after this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter records on or before this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter by method',
    enum: ['manual', 'qr'],
  })
  @IsOptional()
  @IsString()
  method?: 'manual' | 'qr';

  @ApiPropertyOptional({ description: 'Max number of records to return', default: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @ApiPropertyOptional({ description: 'Page number for pagination', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
