import { IsString, MinLength } from 'class-validator';

export class StudentResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
