import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { TeacherStatus } from '../../enums/status.enum.js';

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Enter the full name (minimum 3 characters)' })
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Use 10 digits, e.g. 0771234567' })
  phone?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  batches?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'joiningDate must be in YYYY-MM-DD format',
  })
  joiningDate?: string;

  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moduleIds?: string[];
}
