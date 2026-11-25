import { IsOptional, IsString, MinLength } from 'class-validator';

export class StudentChangePasswordDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}
