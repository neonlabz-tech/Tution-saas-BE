import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Inject,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import {
  StorageService,
  type UploadResult,
  type UploadedImageFile,
} from './storage.service.js';

class UploadBase64Dto {
  @IsString()
  @IsNotEmpty()
  base64!: string;

  @IsOptional()
  @IsString()
  folder?: string;

  @IsOptional()
  @IsString()
  prefix?: string;
}

@Controller('storage')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
export class StorageController {
  constructor(
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max
      },
      fileFilter: (_req, file, cb) => {
        if (
          !file.mimetype.match(
            /\/(jpg|jpeg|png|webp|svg\+xml|pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|zip|octet-stream)$/i,
          ) &&
          !file.originalname.match(/\.(pdf|docx?|zip|png|jpe?g|webp)$/i)
        ) {
          cb(
            new BadRequestException(
              'Unsupported file type. Please upload a PDF, Word document, ZIP archive, or image.',
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: UploadedImageFile,
    @Body('folder') folder?: string,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.storageService.uploadFile(file, folder || 'uploads');
  }

  @Post('upload-base64')
  async uploadBase64(@Body() dto: UploadBase64Dto): Promise<UploadResult> {
    if (!dto.base64) {
      throw new BadRequestException('base64 string is required');
    }
    return this.storageService.uploadBase64(
      dto.base64,
      dto.folder || 'uploads',
      dto.prefix || 'image',
    );
  }

  @Delete()
  async deleteFile(@Query('key') key: string) {
    if (!key) {
      throw new BadRequestException('key query parameter is required');
    }
    const success = await this.storageService.deleteFile(key);
    return { success, message: success ? 'File deleted' : 'File not found' };
  }
}
