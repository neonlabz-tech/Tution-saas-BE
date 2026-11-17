import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { TxType } from '../enums/status.enum.js';
import { STUDENT_STATUSES } from '../students/schemas/student.schema.js';
import {
  createTransactionSchema,
  type CreateTransactionDto,
} from './dto/create-transaction.dto.js';
import {
  financeChartsQuerySchema,
  financeKpisQuerySchema,
  financeTransactionsQuerySchema,
  studentPaymentsQuerySchema,
  type FinanceChartsQueryDto,
  type FinanceKpisQueryDto,
  type FinanceTransactionsQueryDto,
  type StudentPaymentsQueryDto,
} from './dto/finance-query.dto.js';
import {
  recordStudentPaymentSchema,
  type RecordStudentPaymentDto,
} from './dto/record-student-payment.dto.js';
import {
  updateTransactionSchema,
  type UpdateTransactionDto,
} from './dto/update-transaction.dto.js';
import {
  FINANCE_PERIODS,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from './finance.constants.js';
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

  @Post('transactions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a finance income or expense transaction' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'category', 'amount'],
      properties: {
        type: { type: 'string', enum: [TxType.INCOME, TxType.EXPENSE] },
        category: { type: 'string', example: 'Rent' },
        amount: { type: 'number', example: 45000 },
        date: { type: 'string', example: '2026-11-17' },
        description: { type: 'string', example: 'November classroom rent' },
        method: { type: 'string', enum: [...PAYMENT_METHODS] },
        studentId: { type: 'string', example: 'STU-2026-001' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Transaction created' })
  createTransaction(
    @Body({ schema: createTransactionSchema }) body: CreateTransactionDto,
  ) {
    return this.financeService.createTransaction(body);
  }

  @Patch('transactions/:id')
  @ApiOperation({ summary: 'Update an existing finance transaction' })
  @ApiParam({ name: 'id', description: 'Transaction ID (TX-YYYY-NNN) or Mongo _id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [TxType.INCOME, TxType.EXPENSE] },
        category: { type: 'string', example: 'Electricity bills' },
        amount: { type: 'number', example: 12500 },
        date: { type: 'string', example: '2026-11-17' },
        description: { type: 'string', example: 'Updated bill' },
        method: { type: 'string', enum: [...PAYMENT_METHODS] },
        studentId: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Transaction updated' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  updateTransaction(
    @Param('id') id: string,
    @Body({ schema: updateTransactionSchema }) body: UpdateTransactionDto,
  ) {
    return this.financeService.updateTransaction(id, body);
  }

  @Delete('transactions/:id')
  @ApiOperation({ summary: 'Delete a finance transaction' })
  @ApiParam({ name: 'id', description: 'Transaction ID (TX-YYYY-NNN) or Mongo _id' })
  @ApiResponse({ status: 200, description: 'Transaction deleted' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  deleteTransaction(@Param('id') id: string) {
    return this.financeService.deleteTransaction(id);
  }

  @Get('student-payments')
  @ApiOperation({
    summary: 'Fetch student payment summaries and outstanding debtors',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search student name, ID, or email' })
  @ApiQuery({ name: 'batch', required: false })
  @ApiQuery({ name: 'status', required: false, enum: [...STUDENT_STATUSES] })
  @ApiQuery({ name: 'debtorsOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'includeGraduated', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Student payment summaries retrieved' })
  getStudentPayments(
    @Query({ schema: studentPaymentsQuerySchema })
    query: StudentPaymentsQueryDto,
  ) {
    return this.financeService.getStudentPayments(query);
  }

  @Post('student-payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a student fee payment' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['studentId', 'amount', 'method'],
      properties: {
        studentId: { type: 'string', example: 'STU-2026-001' },
        amount: { type: 'number', example: 7500 },
        category: {
          type: 'string',
          enum: [...INCOME_CATEGORIES],
          default: 'Tuition fees',
        },
        method: { type: 'string', enum: [...PAYMENT_METHODS] },
        date: { type: 'string', example: '2026-11-17' },
        description: { type: 'string', example: 'Term 1 tuition installment' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Student payment recorded' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  recordStudentPayment(
    @Body({ schema: recordStudentPaymentSchema })
    body: RecordStudentPaymentDto,
  ) {
    return this.financeService.recordStudentPayment(body);
  }
}
