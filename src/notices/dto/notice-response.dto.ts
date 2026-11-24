/**
 * Swagger-only response shapes. Every success response is wrapped by the
 * global ResponseInterceptor as { success, message, data, timestamp, path }.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NoticePriority,
  NoticeState,
  NoticeStatus,
} from '../../enums/status.enum.js';

export class NoticeResponseDto {
  @ApiProperty({ example: 'NTC-001' })
  id: string;

  @ApiProperty({ example: 'Holiday notice' })
  title: string;

  @ApiProperty({ example: 'Institute will be closed on Monday for Deepavali.' })
  description: string;

  @ApiProperty({ example: true, description: 'true = every batch; batches is then empty' })
  allBatches: boolean;

  @ApiProperty({ type: [String], example: [] })
  batches: string[];

  @ApiProperty({ example: '2026-11-20' })
  publishDate: string;

  @ApiProperty({ example: '2026-11-27' })
  expiryDate: string;

  @ApiPropertyOptional({ example: '23:59' })
  expiryTime?: string;

  @ApiPropertyOptional({ example: '2026-11-27T23:59:00.000Z' })
  expiresAt?: Date;

  @ApiPropertyOptional({ nullable: true, default: null })
  attachment?: {
    key: string;
    fileName: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  } | null;

  @ApiPropertyOptional({ example: false })
  attachmentExpired?: boolean;

  @ApiProperty({ enum: NoticePriority, example: NoticePriority.HIGH })
  priority: NoticePriority;

  @ApiProperty({ enum: NoticeStatus, example: NoticeStatus.PUBLISHED })
  status: NoticeStatus;

  @ApiProperty({
    enum: NoticeState,
    example: NoticeState.ACTIVE,
    description: 'Computed from status + publish/expiry dates (not stored). Expired notices are returned to admins only.',
  })
  state: NoticeState;

  @ApiPropertyOptional({ example: '2026-11-20T06:14:06.793Z' })
  createdAt?: Date;

  @ApiPropertyOptional({ example: '2026-11-20T06:14:06.793Z' })
  updatedAt?: Date;
}

export class NoticeCountsDto {
  @ApiProperty({ example: 6, description: 'Everything, expired included (admins)' }) all: number;
  @ApiProperty({ example: 1 }) draft: number;
  @ApiProperty({ example: 1 }) scheduled: number;
  @ApiProperty({ example: 3 }) active: number;
}

export class NoticeListDto {
  @ApiProperty({ type: [NoticeResponseDto] })
  items: NoticeResponseDto[];

  @ApiProperty({
    type: NoticeCountsDto,
    description: 'Totals per state, ignoring the list filters',
  })
  counts: NoticeCountsDto;
}

export class NoticeDeletedDto {
  @ApiProperty({ example: true }) deleted: true;
  @ApiProperty({ example: 'NTC-001' }) id: string;
}

abstract class EnvelopeBase {
  @ApiProperty({ example: true }) success: boolean;
  @ApiProperty({ example: 'Data retrieved successfully' }) message: string;
  @ApiProperty({ example: '2026-11-20T06:05:08.283Z' }) timestamp: string;
  @ApiProperty({ example: '/api/notices' }) path: string;
}

export class NoticeEnvelopeDto extends EnvelopeBase {
  @ApiProperty({ type: NoticeResponseDto }) data: NoticeResponseDto;
}

export class NoticeListEnvelopeDto extends EnvelopeBase {
  @ApiProperty({ type: NoticeListDto }) data: NoticeListDto;
}

export class NoticeDeletedEnvelopeDto extends EnvelopeBase {
  @ApiProperty({ type: NoticeDeletedDto }) data: NoticeDeletedDto;
}

class ErrorDetailDto {
  @ApiProperty({ example: 'BAD_REQUEST' }) code: string;
  @ApiProperty({ example: 400 }) statusCode: number;
}

export class NoticeErrorDto {
  @ApiProperty({ example: false }) success: boolean;
  @ApiProperty({ example: 'Expiry date must be on or after the publish date' }) message: string;
  @ApiProperty({ example: '2026-11-20T06:05:28.149Z' }) timestamp: string;
  @ApiProperty({ example: '/api/notices' }) path: string;
  @ApiProperty({ type: ErrorDetailDto }) error: ErrorDetailDto;
}
