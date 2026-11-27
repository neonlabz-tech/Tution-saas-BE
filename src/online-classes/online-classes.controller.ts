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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { Role } from '../enums/role.enum.js';
import { CreateOnlineClassDto } from './dto/create-online-class.dto.js';
import { QueryOnlineClassDto } from './dto/query-online-class.dto.js';
import { UpdateOnlineClassDto } from './dto/update-online-class.dto.js';
import { OnlineClassesService } from './online-classes.service.js';
import { OnlineClass } from './schemas/online-class.schema.js';

@ApiTags('Online Classes')
@ApiBearerAuth('access-token')
@Controller(['online-classes', 'classes'])
export class OnlineClassesController {
  constructor(
    @Inject(OnlineClassesService)
    private readonly onlineClassesService: OnlineClassesService,
  ) {}

  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @Get()
  @ApiOperation({ summary: 'Fetch all online classes with optional filtering' })
  @ApiResponse({
    status: 200,
    description: 'List of online classes sorted by start date/time',
    type: [OnlineClass],
  })
  async getAllClasses(
    @Query() query: QueryOnlineClassDto,
  ): Promise<OnlineClass[]> {
    return this.onlineClassesService.findAll(query);
  }

  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single online class by ID' })
  @ApiParam({ name: 'id', description: 'Class ID (e.g. cls_123)' })
  @ApiResponse({
    status: 200,
    description: 'Online class details',
    type: OnlineClass,
  })
  @ApiResponse({ status: 404, description: 'Class not found' })
  async getClassById(@Param('id') id: string): Promise<OnlineClass> {
    return this.onlineClassesService.findById(id);
  }

  @Post()
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Schedule a new online class' })
  @ApiResponse({
    status: 201,
    description: 'Class scheduled successfully',
    type: OnlineClass,
  })
  @ApiResponse({ status: 400, description: 'Validation failed or invalid start/end time' })
  async createClass(
    @Body() dto: CreateOnlineClassDto,
  ): Promise<OnlineClass> {
    return this.onlineClassesService.create(dto);
  }

  @Patch(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Update or reschedule an online class' })
  @ApiParam({ name: 'id', description: 'Class ID to update' })
  @ApiResponse({
    status: 200,
    description: 'Class updated/rescheduled successfully',
    type: OnlineClass,
  })
  @ApiResponse({ status: 404, description: 'Class not found' })
  async updateClass(
    @Param('id') id: string,
    @Body() dto: UpdateOnlineClassDto,
  ): Promise<OnlineClass> {
    return this.onlineClassesService.update(id, dto);
  }

  @Put(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Update or reschedule an online class (PUT alias)' })
  @ApiParam({ name: 'id', description: 'Class ID to update' })
  @ApiResponse({ status: 200, description: 'Class updated successfully' })
  async updateClassPut(
    @Param('id') id: string,
    @Body() dto: UpdateOnlineClassDto,
  ): Promise<OnlineClass> {
    return this.onlineClassesService.update(id, dto);
  }

  @Delete(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a scheduled online class' })
  @ApiParam({ name: 'id', description: 'Class ID to delete' })
  @ApiResponse({ status: 200, description: 'Class deleted successfully' })
  @ApiResponse({ status: 404, description: 'Class not found' })
  async deleteClass(
    @Param('id') id: string,
  ): Promise<{ deleted: true; id: string }> {
    return this.onlineClassesService.delete(id);
  }
}
