import { Controller, Get, Inject } from '@nestjs/common';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { OverviewService } from './overview.service.js';

@Controller('overview')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
export class OverviewController {
  constructor(
    @Inject(OverviewService) private readonly overviewService: OverviewService,
  ) {}

  @Get()
  getOverview() {
    return this.overviewService.getOverview();
  }

  @Get('kpis-trends')
  getKpisAndTrends() {
    return this.overviewService.getKpisAndTrends();
  }

  @Get('activity-feeds')
  getActivityFeeds() {
    return this.overviewService.getActivityFeeds();
  }
}
