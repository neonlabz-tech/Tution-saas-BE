import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ClassStatus } from '../../enums/status.enum.js';

export class UpdateOnlineClassDto {
  @ApiPropertyOptional({
    description: 'Title of the online class',
    example: 'Pure Mathematics — Integration Techniques',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Course module ID',
    example: 'mod_mth',
  })
  @IsOptional()
  @IsString()
  moduleId?: string;

  @ApiPropertyOptional({
    description: 'Assigned teacher ID',
    example: 'tea_1',
  })
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({
    description: 'Target student batch',
    example: '2025-A Morning',
  })
  @IsOptional()
  @IsString()
  batch?: string;

  @ApiPropertyOptional({
    description: 'Scheduled start date and time (YYYY-MM-DDTHH:mm)',
    example: '2026-11-20T09:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/, {
    message: 'Start time must be a valid ISO format (e.g. YYYY-MM-DDTHH:mm)',
  })
  start?: string;

  @ApiPropertyOptional({
    description: 'Scheduled end date and time (YYYY-MM-DDTHH:mm)',
    example: '2026-11-20T10:30',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/, {
    message: 'End time must be a valid ISO format (e.g. YYYY-MM-DDTHH:mm)',
  })
  end?: string;

  @ApiPropertyOptional({
    description: 'Live meeting link',
    example: 'https://meet.google.com/abc-defg-hij',
  })
  @IsOptional()
  @IsString()
  link?: string;

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
  })
  @IsOptional()
  @IsEnum(ClassStatus, { message: 'Status must be scheduled, completed, or cancelled' })
  status?: ClassStatus;
}
