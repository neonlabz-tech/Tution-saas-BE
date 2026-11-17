import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { AttendanceStatus } from '../../enums/status.enum.js';

export class UpsertAttendanceDto {
  @ApiProperty({
    description: 'Student ID (STU-YYYY-NNN) or QR reference',
    example: 'STU-2026-001',
  })
  @IsNotEmpty()
  @IsString()
  studentId: string;

  @ApiProperty({
    description: 'Course module ID',
    example: 'mod_61c16c50',
  })
  @IsNotEmpty()
  @IsString()
  moduleId: string;

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
    description: 'Attendance status',
    enum: AttendanceStatus,
    default: AttendanceStatus.PRESENT,
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({
    description: 'Marking method',
    enum: ['manual', 'qr'],
    default: 'manual',
  })
  @IsOptional()
  @IsString()
  method?: 'manual' | 'qr';

  @ApiPropertyOptional({
    description: 'Optional remarks or notes',
    example: 'Late by 15 mins due to traffic',
  })
  @IsOptional()
  @IsString()
  remarks?: string;
}
