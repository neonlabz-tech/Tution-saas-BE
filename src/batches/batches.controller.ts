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
import { BatchesService, type BatchItem } from './batches.service.js';
import { createBatchSchema, type CreateBatchDto } from './dto/create-batch.dto.js';
import { updateBatchSchema, type UpdateBatchDto } from './dto/update-batch.dto.js';

@ApiTags('Batches')
@ApiBearerAuth('access-token')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get()
  @ApiOperation({ summary: 'Fetch all batches with live student and module counts' })
  @ApiQuery({ name: 'q', required: false, description: 'Search batch name, code, year, description' })
  @ApiResponse({ status: 200, description: 'Batches list fetched successfully' })
  findAll(@Query('q') q?: string): Promise<BatchItem[]> {
    return this.batchesService.findAll(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get batch details by ID or name' })
  @ApiParam({ name: 'id', description: 'Batch ID or name' })
  @ApiResponse({ status: 200, description: 'Batch found' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  findOne(@Param('id') id: string): Promise<BatchItem> {
    return this.batchesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new batch' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: '2026-A Morning' },
        code: { type: 'string', example: '2026-A' },
        year: { type: 'string', example: '2026' },
        description: { type: 'string', example: '2026 Academic Year Morning Session' },
        status: { type: 'string', enum: ['active', 'upcoming', 'archived'], default: 'active' },
        category: { type: 'string', enum: ['al', 'grade'], default: 'al' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Batch created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Batch name already exists' })
  create(@Body({ schema: createBatchSchema }) body: CreateBatchDto): Promise<BatchItem> {
    return this.batchesService.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update batch details by ID or name' })
  @ApiParam({ name: 'id', description: 'Batch ID or name' })
  @ApiResponse({ status: 200, description: 'Batch updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  @ApiResponse({ status: 409, description: 'New batch name already exists' })
  update(
    @Param('id') id: string,
    @Body({ schema: updateBatchSchema }) body: UpdateBatchDto,
  ): Promise<BatchItem> {
    return this.batchesService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a batch by ID or name' })
  @ApiParam({ name: 'id', description: 'Batch ID or name' })
  @ApiResponse({ status: 200, description: 'Batch deleted successfully' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  remove(@Param('id') id: string): Promise<{ success: boolean; message: string; id: string; name: string }> {
    return this.batchesService.remove(id);
  }
}
