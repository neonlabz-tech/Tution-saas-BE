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
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../decorators/current-user.decorator.js';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { Role } from '../enums/role.enum.js';
import {
  FINANCE_PERIODS,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from '../finance/finance.constants.js';
import { STUDENT_STATUSES } from '../students/schemas/student.schema.js';
import {
  createPaymentSchema,
  type CreatePaymentDto,
} from './dto/create-payment.dto.js';
import {
  paymentsListQuerySchema,
  paymentStudentsQuerySchema,
  type PaymentsListQueryDto,
  type PaymentStudentsQueryDto,
} from './dto/payments-query.dto.js';
import {
  updatePaymentSchema,
  type UpdatePaymentDto,
} from './dto/update-payment.dto.js';
import { PaymentsService } from './payments.service.js';
import { PAYMENT_STATUSES } from './schemas/payment.schema.js';

@ApiTags('Payments')
@ApiBearerAuth('access-token')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('students')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List students with live fee totals, paid totals, and balances',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search name, ID, or email' })
  @ApiQuery({ name: 'batch', required: false })
  @ApiQuery({ name: 'status', required: false, enum: STUDENT_STATUSES })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    enum: ['paid', 'partial', 'unpaid'],
  })
  @ApiQuery({ name: 'debtorsOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'includeGraduated', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Student payment balances retrieved' })
  getStudentPayments(
    @Query({ schema: paymentStudentsQuerySchema })
    query: PaymentStudentsQueryDto,
  ) {
    return this.paymentsService.getStudentPayments(query);
  }

  @Get()
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiOperation({
    summary: 'List payments with filtering, pagination, and enriched student details',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Search payment ID, receiptNo, studentId, description, or student name',
  })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'method', required: false, enum: PAYMENT_METHODS })
  @ApiQuery({ name: 'category', required: false, enum: INCOME_CATEGORIES })
  @ApiQuery({ name: 'status', required: false, enum: PAYMENT_STATUSES })
  @ApiQuery({ name: 'period', required: false, enum: FINANCE_PERIODS })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Payments list retrieved' })
  listPayments(
    @Query({ schema: paymentsListQuerySchema }) query: PaymentsListQueryDto,
  ) {
    return this.paymentsService.listPayments(query);
  }

  @Get(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiOperation({
    summary: 'Get payment details by ID, receiptNo, or MongoDB _id',
  })
  @ApiParam({ name: 'id', description: 'Payment ID (PAY-...), receiptNo (RCP-...), or _id' })
  @ApiResponse({ status: 200, description: 'Payment details retrieved' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  getPaymentById(@Param('id') id: string) {
    return this.paymentsService.getPaymentById(id);
  }

  @Post()
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a student payment and auto-sync a Finance income transaction',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['studentId', 'amount', 'method'],
      properties: {
        studentId: { type: 'string', example: 'STU-2026-001' },
        amount: { type: 'number', example: 25000 },
        discount: { type: 'number', example: 0 },
        method: { type: 'string', enum: [...PAYMENT_METHODS] },
        category: {
          type: 'string',
          enum: [...INCOME_CATEGORIES],
          default: 'Tuition fees',
        },
        date: { type: 'string', example: '2026-11-20' },
        description: { type: 'string', example: 'November tuition installment' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Payment recorded and synced' })
  @ApiResponse({ status: 400, description: 'Invalid input or overpayment' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  createPayment(
    @Body({ schema: createPaymentSchema }) dto: CreatePaymentDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const collectedBy = user?.fullName || user?.email || user?.sub;
    return this.paymentsService.createPayment(dto, collectedBy);
  }

  @Patch(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update a payment and sync changes to its linked Finance transaction',
  })
  @ApiParam({ name: 'id', description: 'Payment ID (PAY-...), receiptNo (RCP-...), or _id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        discount: { type: 'number' },
        method: { type: 'string', enum: [...PAYMENT_METHODS] },
        category: { type: 'string', enum: [...INCOME_CATEGORIES] },
        date: { type: 'string', example: '2026-11-20' },
        description: { type: 'string' },
        status: { type: 'string', enum: [...PAYMENT_STATUSES] },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Payment updated and synced' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  updatePayment(
    @Param('id') id: string,
    @Body({ schema: updatePaymentSchema }) dto: UpdatePaymentDto,
  ) {
    return this.paymentsService.updatePayment(id, dto);
  }

  @Delete(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete a payment and its linked Finance transaction',
  })
  @ApiParam({ name: 'id', description: 'Payment ID (PAY-...), receiptNo (RCP-...), or _id' })
  @ApiResponse({ status: 200, description: 'Payment and linked transaction deleted' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  deletePayment(@Param('id') id: string) {
    return this.paymentsService.deletePayment(id);
  }
}
