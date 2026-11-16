import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { AttendanceStatus } from '../../enums/status.enum.js';

export class MarkQrAttendanceDto {
  @ApiProperty({
    description: 'Scanned QR code payload (EDUFLOW:ref, raw ref, or student ID)',
    example: 'EDUFLOW:zy4hyj7qtjok6bwn',
  })
  @IsString()
  @IsNotEmpty({ message: 'QR code or Student ID is required' })
  code: string;

  @ApiProperty({
    description: 'Course module ID for the class session',
    example: 'mod_61c16c50',
  })
  @IsString()
  @IsNotEmpty({ message: 'Module ID is required' })
  moduleId: string;

  @ApiPropertyOptional({
    description: 'Attendance date (YYYY-MM-DD). Defaults to today in UTC.',
    example: '2026-11-16',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
  date?: string;

  @ApiPropertyOptional({
    description: 'Attendance status',
    enum: AttendanceStatus,
    default: AttendanceStatus.PRESENT,
  })
  @IsOptional()
  @IsEnum(AttendanceStatus, {
    message: 'Status must be present, absent, late, or excused',
  })
  status?: AttendanceStatus;
}
