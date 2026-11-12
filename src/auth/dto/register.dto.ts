import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../enums/role.enum.js';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Full name must be at least 3 characters' })
  fullName: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsOptional()
  @IsEnum([Role.ADMIN, Role.TEACHER, Role.STUDENT], {
    message: 'Role must be admin, teacher, or student',
  })
  role?: Role.ADMIN | Role.TEACHER | Role.STUDENT;
}
