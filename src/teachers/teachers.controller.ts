import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaginatedDto } from '../common/dto/paginated.dto.js';
import type { GridFilterModel } from '../common/utils/filter.util.js';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { SortDirection } from '../enums/sort-direction.enum.js';
import { TeacherStatus } from '../enums/status.enum.js';
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { UpdateTeacherDto } from './dto/update-teacher.dto.js';
import {
  TeachersService,
  type TeacherListItem,
  type TeachersMetrics,
} from './teachers.service.js';

@Controller('teachers')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
export class TeachersController {
  constructor(
    @Inject(TeachersService)
    private readonly teachersService: TeachersService,
  ) {}

  @Get()
  async getAllTeachers(
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('sortField') sortField: string = 'createdAt',
    @Query('sortDirection')
    sortDirection: SortDirection = SortDirection.Descending,
    @Query('filterModel') filterModel?: GridFilterModel | string,
    @Query('status') status?: TeacherStatus | 'all',
    @Query('moduleId') moduleId?: string,
    @Query('batch') batch?: string,
    @Query('q') q?: string,
  ): Promise<PaginatedDto<TeacherListItem, TeachersMetrics>> {
    return this.teachersService.getAllTeachers(
      limit,
      page,
      sortField,
      sortDirection,
      filterModel,
      status,
      moduleId,
      batch,
      q,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teachersService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTeacherDto) {
    return this.teachersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.teachersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.teachersService.remove(id);
  }
}
