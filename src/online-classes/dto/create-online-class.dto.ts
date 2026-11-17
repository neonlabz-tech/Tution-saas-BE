import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ClassStatus } from '../../enums/status.enum.js';

export class CreateOnlineClassDto {
  @ApiProperty({
    description: 'Title of the online class',
    example: 'Pure Mathematics — Integration Techniques',
  })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @ApiProperty({
    description: 'Course module ID',
    example: 'mod_mth',
  })
  @IsString()
  @IsNotEmpty({ message: 'Module ID is required' })
  moduleId: string;

  @ApiProperty({
    description: 'Assigned teacher ID',
    example: 'tea_1',
  })
  @IsString()
  @IsNotEmpty({ message: 'Teacher ID is required' })
  teacherId: string;

  @ApiProperty({
    description: 'Target student batch',
    example: '2025-A Morning',
  })
  @IsString()
  @IsNotEmpty({ message: 'Batch is required' })
  batch: string;

  @ApiProperty({
    description: 'Scheduled start date and time (YYYY-MM-DDTHH:mm)',
    example: '2026-11-20T09:00',
  })
  @IsString()
  @IsNotEmpty({ message: 'Start time is required' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/, {
    message: 'Start time must be a valid ISO format (e.g. YYYY-MM-DDTHH:mm)',
  })
  start: string;

  @ApiProperty({
    description: 'Scheduled end date and time (YYYY-MM-DDTHH:mm)',
    example: '2026-11-20T10:30',
  })
  @IsString()
  @IsNotEmpty({ message: 'End time is required' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/, {
    message: 'End time must be a valid ISO format (e.g. YYYY-MM-DDTHH:mm)',
  })
  end: string;

  @ApiProperty({
    description: 'Live meeting link (Zoom, Google Meet, Teams, etc.)',
    example: 'https://meet.google.com/abc-defg-hij',
  })
  @IsString()
  @IsNotEmpty({ message: 'Meeting link is required' })
  link: string;

  @ApiPropertyOptional({
    description: 'Optional class description or agenda',
    example: 'Covering integration by parts and trigonometric substitution.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Class status',
    enum: ClassStatus,
    default: ClassStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(ClassStatus, { message: 'Status must be scheduled, completed, or cancelled' })
  status?: ClassStatus;
}
