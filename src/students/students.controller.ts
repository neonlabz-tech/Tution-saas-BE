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
import {
  createStudentSchema,
  type CreateStudentDto,
} from './dto/create-student.dto.js';
import {
  lookupStudentQuerySchema,
  type LookupStudentQueryDto,
} from './dto/lookup-student.dto.js';
import {
  studentQuerySchema,
  type StudentQueryDto,
} from './dto/student-query.dto.js';
import {
  updateStudentSchema,
  type UpdateStudentDto,
} from './dto/update-student.dto.js';
import { StudentsService } from './students.service.js';

@ApiTags('Students')
@ApiBearerAuth('access-token')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List students with filtering, pagination, and fee summaries',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search name, ID, or email' })
  @ApiQuery({ name: 'batch', required: false })
  @ApiQuery({ name: 'moduleId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'active', 'inactive', 'graduated'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: [
      'fullName',
      'id',
      'batch',
      'enrollmentDate',
      'status',
      'createdAt',
      'feeTotal',
      'paidTotal',
      'outstanding',
    ],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated students retrieved' })
  findAll(@Query({ schema: studentQuerySchema }) query: StudentQueryDto) {
    return this.studentsService.findAll(query);
  }

  @Get('lookup')
  @ApiOperation({
    summary: 'Look up student by EDUFLOW:<ref>, raw <ref>, or STU-YYYY-NNN',
  })
  @ApiQuery({ name: 'code', required: true })
  @ApiResponse({ status: 200, description: 'Student matched' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  lookup(
    @Query({ schema: lookupStudentQuerySchema }) query: LookupStudentQueryDto,
  ) {
    return this.studentsService.lookupByCode(query.code);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Fetch full student detail by STU-YYYY-NNN or database ID',
  })
  @ApiParam({ name: 'id', description: 'Student ID (STU-YYYY-NNN) or Mongo _id' })
  @ApiResponse({ status: 200, description: 'Student detail retrieved' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new student (defaults to pending status)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'fullName',
        'email',
        'phone',
        'dob',
        'address',
        'guardianName',
        'guardianPhone',
        'batch',
        'moduleIds',
      ],
      properties: {
        fullName: { type: 'string', example: 'Nimal Perera' },
        email: { type: 'string', example: 'nimal.perera@mail.lk' },
        phone: { type: 'string', example: '0771234567' },
        dob: { type: 'string', example: '2007-05-14' },
        address: { type: 'string', example: '42, Temple Road, Colombo 07' },
        guardianName: { type: 'string', example: 'Mr. Sunil Perera' },
        guardianPhone: { type: 'string', example: '0712345678' },
        batch: { type: 'string', example: '2025-A Morning' },
        moduleIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['mod_mth', 'mod_phy'],
        },
        enrollmentDate: { type: 'string', example: '2026-11-11' },
        status: {
          type: 'string',
          enum: ['pending', 'active', 'inactive', 'graduated'],
          default: 'pending',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Student created' })
  @ApiResponse({ status: 409, description: 'Duplicate student email' })
  create(@Body({ schema: createStudentSchema }) body: CreateStudentDto) {
    return this.studentsService.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update student fields or status' })
  @ApiParam({ name: 'id', description: 'Student ID (STU-YYYY-NNN) or Mongo _id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', example: 'Nimal Perera' },
        email: { type: 'string', example: 'nimal.perera@mail.lk' },
        phone: { type: 'string', example: '0771234567' },
        dob: { type: 'string', example: '2007-05-14' },
        address: { type: 'string', example: '42, Temple Road, Colombo 07' },
        guardianName: { type: 'string', example: 'Mr. Sunil Perera' },
        guardianPhone: { type: 'string', example: '0712345678' },
        batch: { type: 'string', example: '2025-A Morning' },
        moduleIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['mod_mth', 'mod_phy'],
        },
        enrollmentDate: { type: 'string', example: '2026-11-11' },
        status: {
          type: 'string',
          enum: ['pending', 'active', 'inactive', 'graduated'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Student updated' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  @ApiResponse({ status: 409, description: 'Duplicate student email' })
  update(
    @Param('id') id: string,
    @Body({ schema: updateStudentSchema }) body: UpdateStudentDto,
  ) {
    return this.studentsService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete student and cascade attendance records (preserves transactions)',
  })
  @ApiParam({ name: 'id', description: 'Student ID (STU-YYYY-NNN) or Mongo _id' })
  @ApiResponse({ status: 200, description: 'Student deleted' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  remove(@Param('id') id: string) {
    return this.studentsService.remove(id);
  }

  @Post(':id/rotate-qr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate opaque student QR reference and invalidate previous QR cards',
  })
  @ApiParam({ name: 'id', description: 'Student ID (STU-YYYY-NNN) or Mongo _id' })
  @ApiResponse({ status: 200, description: 'QR reference rotated' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  rotateQr(@Param('id') id: string) {
    return this.studentsService.rotateQr(id);
  }
}
