import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { Notice, type NoticeDocument } from './schemas/notice.schema.js';

export class NoticeDto extends CreateNoticeDto {
  id: string;
  declare batches: string[];
}

@Injectable()
export class NoticesService {
  constructor(
    @InjectModel(Notice.name)
    private readonly notices: Model<Notice>,
  ) {}

  async findAll(): Promise<NoticeDto[]> {
    const docs = await this.notices.find().sort({ publishDate: -1 }).exec();
    return docs.map((doc) => this.toDto(doc));
  }

  async create(dto: CreateNoticeDto): Promise<NoticeDto> {
    this.assertDates(dto);
    const created = await this.notices.create({
      ...dto,
      batches: dto.batches ?? [],
    });
    return this.toDto(created);
  }

  async update(id: string, dto: CreateNoticeDto): Promise<NoticeDto> {
    this.assertId(id);
    this.assertDates(dto);
    const updated = await this.notices
      .findByIdAndUpdate(
        id,
        { ...dto, batches: dto.batches ?? [] },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Notice not found');
    return this.toDto(updated);
  }

  async remove(id: string) {
    this.assertId(id);
    const deleted = await this.notices.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Notice not found');
    return { deleted: true, id };
  }

  private assertId(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Notice not found');
  }

  private assertDates(dto: CreateNoticeDto) {
    if (dto.expiryDate < dto.publishDate) {
      throw new BadRequestException(
        'Expiry must be on or after the publish date',
      );
    }
  }

  private toDto(doc: NoticeDocument): NoticeDto {
    const dto = new NoticeDto();
    dto.id = doc.id || doc._id.toString();
    dto.title = doc.title;
    dto.description = doc.description ?? '';
    dto.batches = doc.batches ?? [];
    dto.publishDate = doc.publishDate;
    dto.expiryDate = doc.expiryDate;
    dto.priority = doc.priority;
    dto.status = doc.status;
    return dto;
  }
}
