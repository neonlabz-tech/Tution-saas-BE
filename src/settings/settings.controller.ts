import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../decorators/current-user.decorator.js';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { UpdateAppearanceDto } from './dto/update-appearance.dto.js';
import { UpdateInstituteDto } from './dto/update-institute.dto.js';
import { UpdateNotificationsDto } from './dto/update-notifications.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
export class SettingsController {
  constructor(
    @Inject(SettingsService) private readonly settingsService: SettingsService,
  ) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getSettings(user.sub);
  }

  @Patch('institute')
  updateInstitute(@Body() dto: UpdateInstituteDto) {
    return this.settingsService.updateInstitute(dto);
  }

  @Patch('appearance')
  updateAppearance(@Body() dto: UpdateAppearanceDto) {
    return this.settingsService.updateAppearance(dto);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.settingsService.updateProfile(user.sub, dto);
  }

  @Patch('notifications')
  updateNotifications(@Body() dto: UpdateNotificationsDto) {
    return this.settingsService.updateNotifications(dto);
  }
}
