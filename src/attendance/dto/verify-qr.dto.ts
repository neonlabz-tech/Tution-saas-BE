import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class VerifyQrDto {
  @ApiProperty({
    description: 'Scanned QR code payload (e.g. EDUFLOW:ref, raw ref, or student ID STU-YYYY-NNN)',
    example: 'EDUFLOW:zy4hyj7qtjok6bwn',
  })
  @IsString()
  @IsNotEmpty({ message: 'QR code is required' })
  code: string;

  @ApiPropertyOptional({
    description: 'Optional course module ID to check enrollment and attendance duplicate status',
    example: 'mod_61c16c50',
  })
  @IsOptional()
  @IsString()
  moduleId?: string;

  @ApiPropertyOptional({
    description: 'Attendance date to check against (YYYY-MM-DD). Defaults to today.',
    example: '2026-11-16',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
  date?: string;
}
