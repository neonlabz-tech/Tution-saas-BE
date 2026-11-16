import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { AttendanceStatus } from '../../enums/status.enum.js';

export class MarkManualAttendanceDto {
  @ApiProperty({
    description: 'Student ID (STU-YYYY-NNN)',
    example: 'STU-2026-001',
  })
  @IsString()
  @IsNotEmpty({ message: 'Student ID is required' })
  studentId: string;

  @ApiProperty({
    description: 'Course module ID',
    example: 'mod_61c16c50',
  })
  @IsString()
  @IsNotEmpty({ message: 'Module ID is required' })
  moduleId: string;

  @ApiProperty({
    description: 'Attendance date (YYYY-MM-DD)',
    example: '2026-11-16',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
  date: string;

  @ApiProperty({
    description: 'Attendance status',
    enum: AttendanceStatus,
    example: AttendanceStatus.PRESENT,
  })
  @IsEnum(AttendanceStatus, {
    message: 'Status must be present, absent, late, or excused',
  })
  status: AttendanceStatus;

  @ApiPropertyOptional({
    description: 'Attendance recording method',
    enum: ['manual', 'qr'],
    default: 'manual',
  })
  @IsOptional()
  @IsString()
  method?: 'manual' | 'qr';
}
