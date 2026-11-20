import { PartialType } from '@nestjs/swagger';
import { CreateNoticeDto } from './create-notice.dto.js';

export class UpdateNoticeDto extends PartialType(CreateNoticeDto) {}
