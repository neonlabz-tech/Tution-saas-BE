import { IsEnum, IsOptional } from 'class-validator';

export class UpdateAppearanceDto {
  @IsOptional()
  @IsEnum(['light', 'dark', 'system'])
  mode?: 'light' | 'dark' | 'system';

  @IsOptional()
  @IsEnum(['indigo', 'violet', 'teal', 'rose'])
  accent?: 'indigo' | 'violet' | 'teal' | 'rose';
}
