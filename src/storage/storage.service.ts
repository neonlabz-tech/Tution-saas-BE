import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  size?: number;
  mimeType?: string;
}

export interface UploadedImageFile {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    this.bucketName =
      this.configService.get<string>('R2_BUCKET_NAME') || 'tuition-saas';
    const rawPublicUrl =
      this.configService.get<string>('R2_PUBLIC_URL') ||
      'https://pub-f17818466e4646e8aae1bf24d363f534.r2.dev';
    this.publicUrl = rawPublicUrl.replace(/\/$/, '');

    if (accountId && accessKeyId && secretAccessKey) {
      // Cloudflare R2 standard S3 endpoint format: https://<account_id>.r2.cloudflarestorage.com
      const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.logger.log(
        `Cloudflare R2 Storage initialized for bucket "${this.bucketName}" at ${endpoint}`,
      );
    } else {
      this.logger.warn(
        'Cloudflare R2 credentials not fully provided; storage service running in offline mode',
      );
    }
  }

  /**
   * Upload an in-memory file buffer (from Multer) to Cloudflare R2.
   */
  async uploadFile(
    file: UploadedImageFile,
    folder = 'uploads',
  ): Promise<UploadResult> {
    if (!this.s3Client) {
      throw new InternalServerErrorException(
        'Cloudflare R2 Storage client is not configured',
      );
    }

    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided for upload');
    }

    const ext = this.getExtension(file.originalname, file.mimetype);
    const key = `${folder}/${Date.now()}-${randomUUID()}.${ext}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype || 'application/octet-stream',
        }),
      );

      const url = `${this.publicUrl}/${key}`;
      this.logger.log(`Uploaded file to R2: ${key} -> ${url}`);

      return {
        url,
        key,
        bucket: this.bucketName,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (err) {
      this.logger.error(`Failed to upload file to R2 key ${key}:`, err);
      throw new InternalServerErrorException(
        `Failed to upload image to storage: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Upload a base64 Data URL (e.g. "data:image/png;base64,...") to Cloudflare R2.
   */
  async uploadBase64(
    base64Data: string,
    folder = 'uploads',
    filenamePrefix = 'image',
  ): Promise<UploadResult> {
    if (!this.s3Client) {
      throw new InternalServerErrorException(
        'Cloudflare R2 Storage client is not configured',
      );
    }

    if (!base64Data || typeof base64Data !== 'string') {
      throw new BadRequestException('Invalid base64 image data');
    }

    // Parse mime type and payload from data url: "data:image/png;base64,iVBORw0KGgo..."
    let mimeType = 'image/png';
    let rawBase64 = base64Data;

    const matches = base64Data.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      rawBase64 = matches[2];
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    const ext = this.mimeToExtension(mimeType);
    const key = `${folder}/${filenamePrefix}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );

      const url = `${this.publicUrl}/${key}`;
      this.logger.log(`Uploaded base64 image to R2: ${key} -> ${url}`);

      return {
        url,
        key,
        bucket: this.bucketName,
        size: buffer.length,
        mimeType,
      };
    } catch (err) {
      this.logger.error(`Failed to upload base64 to R2 key ${key}:`, err);
      throw new InternalServerErrorException(
        `Failed to upload base64 image to storage: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Delete an object from Cloudflare R2 by key or full URL.
   */
  async deleteFile(keyOrUrl: string): Promise<boolean> {
    if (!this.s3Client) return false;

    let key = keyOrUrl;
    if (key.startsWith(this.publicUrl)) {
      key = key.replace(`${this.publicUrl}/`, '');
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      this.logger.log(`Deleted object from R2: ${key}`);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to delete object from R2: ${key}`, err);
      return false;
    }
  }

  private getExtension(filename: string, mimetype?: string): string {
    const fromFilename = filename.split('.').pop()?.toLowerCase();
    if (fromFilename && fromFilename.length <= 5) {
      return fromFilename;
    }
    return mimetype ? this.mimeToExtension(mimetype) : 'jpg';
  }

  private mimeToExtension(mime: string): string {
    switch (mime.toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/webp':
        return 'webp';
      case 'image/svg+xml':
        return 'svg';
      case 'image/gif':
        return 'gif';
      default:
        return 'png';
    }
  }
}
