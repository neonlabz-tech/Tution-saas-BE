import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class QueryAttendanceSummariesDto {
  @ApiPropertyOptional({
    description: 'Start date of range (YYYY-MM-DD)',
    example: '2026-11-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from date must be in YYYY-MM-DD format',
  })
  from?: string;

  @ApiPropertyOptional({
    description: 'End date of range (YYYY-MM-DD)',
    example: '2026-11-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to date must be in YYYY-MM-DD format',
  })
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter by module ID or "all"',
    example: 'mod_61c16c50',
  })
  @IsOptional()
  @IsString()
  moduleId?: string;

  @ApiPropertyOptional({
    description: 'Filter by student batch or "all"',
    example: '2026 A/L',
  })
  @IsOptional()
  @IsString()
  batch?: string;

  @ApiPropertyOptional({
    description: 'Filter by specific student ID',
    example: 'STU-2026-001',
  })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Search by student name or student ID',
    example: 'Nimal',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Search alias for q',
    example: 'Nimal',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
