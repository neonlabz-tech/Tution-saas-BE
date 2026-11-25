import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class StudentRegisterDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  dob: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  guardianName: string;

  @IsString()
  @IsNotEmpty()
  guardianPhone: string;

  @IsString()
  @IsNotEmpty()
  batch: string;

  @IsArray()
  @IsString({ each: true })
  moduleIds: string[];

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @MinLength(8)
  password: string;
}
