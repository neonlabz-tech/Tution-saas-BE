import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ClassStatus, ClassType } from '../../enums/status.enum.js';

export class QueryOnlineClassDto {
  @ApiPropertyOptional({ description: 'Filter by teacher ID' })
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Filter by course module ID' })
  @IsOptional()
  @IsString()
  moduleId?: string;

  @ApiPropertyOptional({ description: 'Filter by batch name' })
  @IsOptional()
  @IsString()
  batch?: string;

  @ApiPropertyOptional({ description: 'Filter by class type (online or physical)', enum: ClassType })
  @IsOptional()
  @IsString()
  classType?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: ClassStatus })
  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;

  @ApiPropertyOptional({ description: 'Filter classes ending at or after this date-time' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter classes starting at or before this date-time' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Search keyword matching title, batch, or link' })
  @IsOptional()
  @IsString()
  q?: string;
}
