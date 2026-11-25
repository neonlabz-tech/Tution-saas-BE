import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { Public } from '../decorators/public.decorator.js';
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
  type AttachmentDownloadResult,
  type NoticeFindOptions,
  type NoticeListResult,
  type NoticeView,
  NoticesService,
  type UploadedNoticeFile,
} from './notices.service.js';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

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

  @Public()
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

  @Public()
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

  @Post(':id/attachment')
  @AllowedRoles(...MANAGER_ROLES)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a PDF or image attachment (max 5 MB, admin only)' })
  @ApiParam(ID_PARAM)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Attachment uploaded', type: NoticeEnvelopeDto })
  @ApiResponse(BAD_REQUEST)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_ATTACHMENT_BYTES }),
        ],
      }),
    )
    file: UploadedNoticeFile,
  ): Promise<NoticeView> {
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed: application/pdf, image/png, image/jpeg, image/webp',
      );
    }
    return this.noticesService.uploadAttachment(id, file);
  }

  @Public()
  @Get(':id/attachment')
  @ApiOperation({
    summary: 'Get a short-lived presigned download URL for a notice attachment',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, description: 'Presigned download URL generated' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse({ status: 410, description: 'Attachment expired' })
  async getAttachment(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<AttachmentDownloadResult | void> {
    const result = await this.noticesService.getAttachmentDownload(id, viewOptions(user));
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect(result.url);
    }
    return result;
  }

  @Delete(':id/attachment')
  @AllowedRoles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove attachment from a notice (admin only)' })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, description: 'Attachment deleted', type: NoticeEnvelopeDto })
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  async deleteAttachment(@Param('id') id: string): Promise<NoticeView> {
    return this.noticesService.deleteAttachment(id);
  }
}
