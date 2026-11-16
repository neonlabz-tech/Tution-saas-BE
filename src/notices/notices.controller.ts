import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';
import { NoticesService } from './notices.service.js';

@ApiTags('Notices')
@ApiBearerAuth('access-token')
@Controller('notices')
export class NoticesController {
  constructor(
    @Inject(NoticesService)
    private readonly noticesService: NoticesService,
  ) {}

  @Get()
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: 'Get all notices sorted by publish date descending' })
  @ApiResponse({ status: 200, description: 'List of notices' })
  findAll() {
    return this.noticesService.findAll();
  }

  @Get(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: 'Get a single notice by ID' })
  @ApiParam({ name: 'id', description: 'Notice ID' })
  @ApiResponse({ status: 200, description: 'Notice found' })
  @ApiResponse({ status: 404, description: 'Notice not found' })
  findOne(@Param('id') id: string) {
    return this.noticesService.findOne(id);
  }

  @Post()
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new notice' })
  @ApiResponse({ status: 201, description: 'Notice successfully created' })
  create(@Body() dto: CreateNoticeDto) {
    return this.noticesService.create(dto);
  }

  @Patch(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an existing notice' })
  @ApiParam({ name: 'id', description: 'Notice ID' })
  @ApiResponse({ status: 200, description: 'Notice updated' })
  @ApiResponse({ status: 404, description: 'Notice not found' })
  update(@Param('id') id: string, @Body() dto: UpdateNoticeDto) {
    return this.noticesService.update(id, dto);
  }

  @Delete(':id')
  @AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a notice' })
  @ApiParam({ name: 'id', description: 'Notice ID' })
  @ApiResponse({ status: 200, description: 'Notice deleted' })
  @ApiResponse({ status: 404, description: 'Notice not found' })
  remove(@Param('id') id: string) {
    return this.noticesService.remove(id);
  }
}
