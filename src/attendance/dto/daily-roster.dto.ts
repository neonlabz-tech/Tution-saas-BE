import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class DailyRosterQueryDto {
  @ApiPropertyOptional({
    description: 'Target roster date (YYYY-MM-DD). Defaults to today.',
    example: '2026-11-17',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

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
    description: 'Filter by student ID',
    example: 'STU-2026-001',
  })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Search filter by student full name or student ID',
    example: 'Nimal',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
