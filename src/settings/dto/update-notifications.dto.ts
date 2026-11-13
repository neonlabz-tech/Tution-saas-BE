import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';

export class NotificationTogglesDto {
  @IsOptional()
  @IsBoolean()
  payments?: boolean;

  @IsOptional()
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsBoolean()
  absence?: boolean;

  @IsOptional()
  @IsBoolean()
  classes?: boolean;

  @IsOptional()
  @IsBoolean()
  notices?: boolean;
}

export class NotificationChannelsDto {
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  sms?: boolean;
}

export class UpdateNotificationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTogglesDto)
  notifications?: NotificationTogglesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  channels?: NotificationChannelsDto;
}
