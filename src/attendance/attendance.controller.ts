import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { AttendanceService } from './attendance.service.js';
import { BulkMarkUnmarkedDto } from './dto/bulk-mark-unmarked.dto.js';
import { DailyRosterQueryDto } from './dto/daily-roster.dto.js';
import { MarkManualAttendanceDto } from './dto/mark-manual-attendance.dto.js';
import { MarkQrAttendanceDto } from './dto/mark-qr-attendance.dto.js';
import { QueryAttendanceSummariesDto } from './dto/query-attendance-summaries.dto.js';
import { QueryAttendanceDto } from './dto/query-attendance.dto.js';
import { StudentHistoryQueryDto } from './dto/student-history-query.dto.js';
import { UpsertAttendanceDto } from './dto/upsert-attendance.dto.js';
import { VerifyQrDto } from './dto/verify-qr.dto.js';
import { AttendanceRecord } from './schemas/attendance.schema.js';

@ApiTags('Attendance')
@ApiBearerAuth('access-token')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
@Controller('attendance')
export class AttendanceController {
  constructor(
    @Inject(AttendanceService)
    private readonly attendanceService: AttendanceService,
  ) {}

  @Post('qr/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify & Lookup Student by QR code payload or ID',
    description:
      'Validates scanned code (EDUFLOW:ref, raw ref, or STU-YYYY-NNN), checks student active status, enrollment in module, and whether attendance was already marked.',
  })
  @ApiResponse({ status: 200, description: 'QR verification result' })
  @ApiResponse({ status: 400, description: 'Invalid QR or student inactive' })
  @ApiResponse({ status: 404, description: 'Student or module not found' })
  async verifyQrPost(@Body() dto: VerifyQrDto) {
    return this.attendanceService.verifyQr(dto);
  }

  @Get('qr/verify')
  @ApiOperation({
    summary: 'Verify & Lookup Student by QR code via GET query',
  })
  @ApiResponse({ status: 200, description: 'QR verification result' })
  async verifyQrGet(@Query() query: VerifyQrDto) {
    return this.attendanceService.verifyQr(query);
  }

  @Post('qr/mark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark Attendance via QR code scan',
    description:
      'Resolves student from QR payload, validates enrollment in the specified module, and records attendance with method="qr".',
  })
  @ApiResponse({ status: 200, description: 'Attendance recorded successfully' })
  @ApiResponse({ status: 400, description: 'Student not active or not enrolled in module' })
  @ApiResponse({ status: 404, description: 'Student or module not found' })
  async markQrAttendance(@Body() dto: MarkQrAttendanceDto) {
    return this.attendanceService.markQrAttendance(dto);
  }

  @Post('manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark student attendance manually' })
  @ApiResponse({ status: 200, description: 'Attendance marked manually' })
  async markManualAttendance(@Body() dto: MarkManualAttendanceDto) {
    return this.attendanceService.markManualAttendance(dto);
  }

  @Post('mark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark or Upsert student attendance record',
    description: 'Creates or updates attendance record for a student, module, and date.',
  })
  @ApiResponse({ status: 200, description: 'Attendance marked or updated' })
  async upsertAttendancePost(@Body() dto: UpsertAttendanceDto) {
    return this.attendanceService.upsertAttendance(dto);
  }

  @Put('mark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upsert student attendance record (PUT alias)',
  })
  @ApiResponse({ status: 200, description: 'Attendance updated' })
  async upsertAttendancePut(@Body() dto: UpsertAttendanceDto) {
    return this.attendanceService.upsertAttendance(dto);
  }

  @Get('daily-roster')
  @ApiOperation({
    summary: 'Fetch Daily Roster with student entries and attendance status',
    description:
      'Returns active student-module pairs for the specified date, matching filters, showing existing attendance records and unmarked counts.',
  })
  @ApiResponse({ status: 200, description: 'Daily roster data' })
  async getDailyRoster(@Query() query: DailyRosterQueryDto) {
    return this.attendanceService.getDailyRoster(query);
  }

  @Get('roster')
  @ApiOperation({
    summary: 'Fetch Daily Roster (alias)',
  })
  @ApiResponse({ status: 200, description: 'Daily roster data' })
  async getDailyRosterAlias(@Query() query: DailyRosterQueryDto) {
    return this.attendanceService.getDailyRoster(query);
  }

  @Get('summaries')
  @ApiOperation({
    summary: 'Fetch Attendance Summaries for date range',
    description:
      'Returns aggregated attendance stats per student (present, absent, late, excused, attendance rate) for weekly/monthly dashboard views.',
  })
  @ApiResponse({ status: 200, description: 'Student attendance summaries' })
  async getSummaries(@Query() query: QueryAttendanceSummariesDto) {
    return this.attendanceService.getSummaries(query);
  }

  @Post('bulk-mark-unmarked')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk Mark Unmarked Students as Present',
    description:
      'Finds all active students without an attendance record for the date and marks them as present in one atomic operation.',
  })
  @ApiResponse({ status: 200, description: 'Bulk attendance marked' })
  async bulkMarkUnmarkedPost(@Body() dto: BulkMarkUnmarkedDto) {
    return this.attendanceService.bulkMarkUnmarked(dto);
  }

  @Post('bulk-present')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk Mark Unmarked Students as Present (alias)',
  })
  @ApiResponse({ status: 200, description: 'Bulk attendance marked' })
  async bulkPresentAlias(@Body() dto: BulkMarkUnmarkedDto) {
    return this.attendanceService.bulkMarkUnmarked(dto);
  }

  @Get('student/:studentId')
  @ApiOperation({
    summary: 'Student Attendance History & Overall Rate',
    description:
      'Returns complete attendance history, rate percentage, and breakdown counts for a specific student.',
  })
  @ApiParam({ name: 'studentId', description: 'Student ID or QR reference' })
  @ApiResponse({ status: 200, description: 'Student attendance history' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  async getStudentHistory(
    @Param('studentId') studentId: string,
    @Query() query: StudentHistoryQueryDto,
  ) {
    return this.attendanceService.getStudentHistory(studentId, query);
  }

  @Get('history/:studentId')
  @ApiOperation({
    summary: 'Student Attendance History (alias)',
  })
  @ApiParam({ name: 'studentId', description: 'Student ID or QR reference' })
  @ApiResponse({ status: 200, description: 'Student attendance history' })
  async getStudentHistoryAlias(
    @Param('studentId') studentId: string,
    @Query() query: StudentHistoryQueryDto,
  ) {
    return this.attendanceService.getStudentHistory(studentId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get attendance metrics and breakdown for date & module' })
  @ApiQuery({ name: 'date', required: false, example: '2026-11-17' })
  @ApiQuery({ name: 'moduleId', required: false, example: 'mod_61c16c50' })
  async getStats(
    @Query('date') date?: string,
    @Query('moduleId') moduleId?: string,
  ) {
    return this.attendanceService.getStats(date, moduleId);
  }

  @Get()
  @ApiOperation({ summary: 'List raw attendance records with filters' })
  @ApiResponse({ status: 200, type: [AttendanceRecord] })
  async findAll(@Query() query: QueryAttendanceDto) {
    return this.attendanceService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single attendance record by ID' })
  @ApiParam({ name: 'id', description: 'Attendance record ID (e.g. att_STU-2026-001_mod_1_2026-11-17)' })
  @ApiResponse({ status: 200, type: AttendanceRecord })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async findById(@Param('id') id: string) {
    return this.attendanceService.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete/undo an attendance record' })
  @ApiParam({ name: 'id', description: 'Attendance record ID' })
  @ApiResponse({ status: 200, description: 'Record deleted' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async delete(@Param('id') id: string) {
    return this.attendanceService.delete(id);
  }
}
