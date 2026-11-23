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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../decorators/current-user.decorator.js';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import {
  NoticeDeletedEnvelopeDto,
  NoticeEnvelopeDto,
  NoticeErrorDto,
  NoticeListEnvelopeDto,
} from './dto/notice-response.dto.js';
import { QueryNoticeDto } from './dto/query-notice.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';
import {
  type NoticeFindOptions,
  type NoticeListResult,
  type NoticeView,
  NoticesService,
} from './notices.service.js';

const MANAGER_ROLES: Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

/** Admins see every notice; other portals only see live (active) ones. */
function viewOptions(user?: AuthenticatedUser): NoticeFindOptions {
  return { activeOnly: !user || !MANAGER_ROLES.includes(user.role) };
}

const ID_PARAM = { name: 'id', description: 'Notice ID (e.g. NTC-001)', example: 'NTC-001' };
const NOT_FOUND = { status: 404, description: 'Notice not found', type: NoticeErrorDto };
const BAD_REQUEST = { status: 400, description: 'Validation failed', type: NoticeErrorDto };
const FORBIDDEN = { status: 403, description: 'Admin / super admin only', type: NoticeErrorDto };

@ApiTags('Notices')
@ApiBearerAuth('access-token')
@Controller('notices')
export class NoticesController {
  constructor(
    @Inject(NoticesService) private readonly noticesService: NoticesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Fetch notices with filters and per-state counts',
    description:
      'Admins get all notices. Teachers/students only get active notices.',
  })
  @ApiResponse({ status: 200, description: 'Notices and per-state counts', type: NoticeListEnvelopeDto })
  @ApiResponse(BAD_REQUEST)
  async getNotices(
    @Query() query: QueryNoticeDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<NoticeListResult> {
    return this.noticesService.findAll(query, viewOptions(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single notice' })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, description: 'Notice details', type: NoticeEnvelopeDto })
  @ApiResponse(NOT_FOUND)
  async getNotice(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<NoticeView> {
    return this.noticesService.findById(id, viewOptions(user));
  }

  @Post()
  @AllowedRoles(...MANAGER_ROLES)
  @ApiOperation({ summary: 'Create a notice (admin only)' })
  @ApiResponse({ status: 201, description: 'Notice created', type: NoticeEnvelopeDto })
  @ApiResponse(BAD_REQUEST)
  @ApiResponse(FORBIDDEN)
  async createNotice(@Body() dto: CreateNoticeDto): Promise<NoticeView> {
    return this.noticesService.create(dto);
  }

  @Patch(':id')
  @AllowedRoles(...MANAGER_ROLES)
  @ApiOperation({ summary: 'Update a notice (admin only). Send only the fields to change.' })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, description: 'Notice updated', type: NoticeEnvelopeDto })
  @ApiResponse(BAD_REQUEST)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  async updateNotice(
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto,
  ): Promise<NoticeView> {
    return this.noticesService.update(id, dto);
  }

  @Delete(':id')
  @AllowedRoles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a notice (admin only). Cannot be undone.' })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, description: 'Notice deleted', type: NoticeDeletedEnvelopeDto })
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  async deleteNotice(
    @Param('id') id: string,
  ): Promise<{ deleted: true; id: string }> {
    return this.noticesService.delete(id);
  }
}
