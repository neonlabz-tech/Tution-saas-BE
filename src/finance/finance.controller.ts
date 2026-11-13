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
import { TxType } from '../enums/status.enum.js';
import {
  financeChartsQuerySchema,
  financeKpisQuerySchema,
  financeTransactionsQuerySchema,
  type FinanceChartsQueryDto,
  type FinanceKpisQueryDto,
  type FinanceTransactionsQueryDto,
} from './dto/finance-query.dto.js';
import { FINANCE_PERIODS } from './finance.constants.js';
import { FinanceService } from './finance.service.js';

@ApiTags('Finance')
@ApiBearerAuth('access-token')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('transactions')
  @ApiOperation({
    summary: 'Fetch paginated finance transactions and KPI summary',
  })
  @ApiQuery({ name: 'period', required: false, enum: FINANCE_PERIODS })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: '"all" or specific category name',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: [TxType.INCOME, TxType.EXPENSE],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Finance transactions and KPIs retrieved',
  })
  getTransactions(
    @Query({ schema: financeTransactionsQuerySchema })
    query: FinanceTransactionsQueryDto,
  ) {
    return this.financeService.getTransactions(query);
  }

  @Get('kpis')
  @ApiOperation({
    summary: 'Fetch finance KPI summary for the selected period and category',
  })
  @ApiQuery({ name: 'period', required: false, enum: FINANCE_PERIODS })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: '"all" or specific category name',
  })
  @ApiResponse({ status: 200, description: 'Finance KPIs retrieved' })
  getKpis(
    @Query({ schema: financeKpisQuerySchema }) query: FinanceKpisQueryDto,
  ) {
    return this.financeService.getKpis(query);
  }

  @Get('charts')
  @ApiOperation({
    summary: 'Fetch time series buckets and category breakdown donuts',
  })
  @ApiQuery({ name: 'period', required: false, enum: FINANCE_PERIODS })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: '"all" or specific category name',
  })
  @ApiResponse({
    status: 200,
    description: 'Finance chart series and breakdowns retrieved',
  })
  getCharts(
    @Query({ schema: financeChartsQuerySchema }) query: FinanceChartsQueryDto,
  ) {
    return this.financeService.getCharts(query);
  }
}
