import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { ModuleStatus } from '../enums/status.enum.js';
import { FINANCE_PERIODS } from '../finance/finance.constants.js';
import { AnalyticsService } from './analytics.service.js';
import {
  analyticsModulePerformanceQuerySchema,
  analyticsOverviewQuerySchema,
  type AnalyticsModulePerformanceQueryDto,
  type AnalyticsOverviewQueryDto,
} from './dto/analytics-query.dto.js';

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Fetch period KPIs, finance/enrollment/attendance series, and expense & payment-status donuts',
  })
  @ApiQuery({ name: 'period', required: false, enum: FINANCE_PERIODS })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'batch', required: false })
  @ApiQuery({ name: 'moduleId', required: false })
  @ApiResponse({ status: 200, description: 'Analytics overview retrieved' })
  getOverview(
    @Query({ schema: analyticsOverviewQuerySchema })
    query: AnalyticsOverviewQueryDto,
  ) {
    return this.analyticsService.getOverview(query);
  }

  @Get('modules')
  @ApiOperation({
    summary:
      'Fetch module performance breakdown (enrolled count, pro-rata collected & owed, attendance rate)',
  })
  @ApiQuery({ name: 'period', required: false, enum: FINANCE_PERIODS })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [ModuleStatus.ACTIVE, ModuleStatus.UPCOMING, ModuleStatus.ARCHIVED],
  })
  @ApiResponse({
    status: 200,
    description: 'Module performance breakdown retrieved',
  })
  getModulePerformance(
    @Query({ schema: analyticsModulePerformanceQuerySchema })
    query: AnalyticsModulePerformanceQueryDto,
  ) {
    return this.analyticsService.getModulePerformance(query);
  }
}
