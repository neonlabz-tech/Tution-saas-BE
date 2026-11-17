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
  Put,
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
  createModuleSchema,
  type CreateModuleDto,
} from './dto/create-module.dto.js';
import {
  moduleQuerySchema,
  type ModuleQueryDto,
} from './dto/module-query.dto.js';
import {
  syncEnrollmentsSchema,
  type SyncEnrollmentsDto,
} from './dto/sync-enrollments.dto.js';
import {
  updateModuleSchema,
  type UpdateModuleDto,
} from './dto/update-module.dto.js';
import { ModulesService } from './modules.service.js';

@ApiTags('Modules')
@ApiBearerAuth('access-token')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get()
  @ApiOperation({
    summary: 'Fetch all modules with search, filters, teacher and enrolled counts',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search module name or code' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'upcoming', 'archived'],
  })
  @ApiQuery({ name: 'teacherId', required: false, description: 'Filter by assigned teacher ID' })
  @ApiQuery({ name: 'batch', required: false, description: 'Filter by batch name' })
  @ApiResponse({ status: 200, description: 'List of modules retrieved successfully' })
  findAll(@Query({ schema: moduleQuerySchema }) query: ModuleQueryDto) {
    return this.modulesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Fetch module details by module ID or database ID',
  })
  @ApiParam({ name: 'id', description: 'Module ID (e.g. mod_mth) or Mongo _id' })
  @ApiResponse({ status: 200, description: 'Module detail retrieved' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  findOne(@Param('id') id: string) {
    return this.modulesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new course module' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'name', 'description', 'fee', 'duration', 'batches'],
      properties: {
        code: { type: 'string', example: 'MTH-101' },
        name: { type: 'string', example: 'Advanced Mathematics' },
        description: {
          type: 'string',
          example:
            'Calculus, algebra and structured problem-solving for exam excellence.',
        },
        fee: { type: 'number', example: 72000 },
        duration: { type: 'string', example: '6 months' },
        teacherId: { type: 'string', nullable: true, example: 'TCH-001' },
        batches: {
          type: 'array',
          items: { type: 'string' },
          example: ['2025-A Morning', '2025-B Evening'],
        },
        status: {
          type: 'string',
          enum: ['active', 'upcoming', 'archived'],
          default: 'active',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Module created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Module code already exists' })
  create(@Body({ schema: createModuleSchema }) body: CreateModuleDto) {
    return this.modulesService.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update module fields or teacher assignment' })
  @ApiParam({ name: 'id', description: 'Module ID or Mongo _id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'MTH-101' },
        name: { type: 'string', example: 'Advanced Mathematics' },
        description: { type: 'string' },
        fee: { type: 'number', example: 75000 },
        duration: { type: 'string', example: '6 months' },
        teacherId: { type: 'string', nullable: true, example: 'TCH-002' },
        batches: {
          type: 'array',
          items: { type: 'string' },
          example: ['2025-A Morning'],
        },
        status: {
          type: 'string',
          enum: ['active', 'upcoming', 'archived'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Module updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Module or teacher not found' })
  @ApiResponse({ status: 409, description: 'Module code already exists' })
  update(
    @Param('id') id: string,
    @Body({ schema: updateModuleSchema }) body: UpdateModuleDto,
  ) {
    return this.modulesService.update(id, body);
  }

  @Put(':id/enrollments')
  @ApiOperation({
    summary: 'Sync student enrollments for a module (adds/removes students)',
  })
  @ApiParam({ name: 'id', description: 'Module ID or Mongo _id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['studentIds'],
      properties: {
        studentIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['STU-2026-001', 'STU-2026-002'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Module enrollments synchronized' })
  @ApiResponse({ status: 400, description: 'Invalid or graduated students' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  syncEnrollments(
    @Param('id') id: string,
    @Body({ schema: syncEnrollmentsSchema }) body: SyncEnrollmentsDto,
  ) {
    return this.modulesService.syncEnrollments(id, body);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete module and cascade to student enrollments, online classes, and attendance records',
  })
  @ApiParam({ name: 'id', description: 'Module ID or Mongo _id' })
  @ApiResponse({ status: 200, description: 'Module deleted successfully' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  remove(@Param('id') id: string) {
    return this.modulesService.remove(id);
  }
}
