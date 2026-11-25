import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getBucketName(): string {
    const bucket = this.configService.get<string>('R2_BUCKET_NAME');
    if (!bucket) {
      throw new InternalServerErrorException(
        'Cloudflare R2 storage is not configured (missing R2_BUCKET_NAME)',
      );
    }
    return bucket;
  }

  private resolveEndpoint(): string | undefined {
    let endpoint = this.configService.get<string>('R2_ENDPOINT');
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');

    if (!endpoint && accountId) {
      endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    }

    if (endpoint) {
      endpoint = endpoint.replace(/\/+$/, '');
      if (bucketName && endpoint.endsWith(`/${bucketName}`)) {
        endpoint = endpoint.slice(0, -(bucketName.length + 1));
      }
    }

    return endpoint;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;

    const endpoint = this.resolveEndpoint();
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'Cloudflare R2 storage is not configured (missing R2_ENDPOINT/R2_ACCOUNT_ID or credentials)',
      );
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    return this.client;
  }

  isConfigured(): boolean {
    const endpoint = this.resolveEndpoint();
    return Boolean(
      endpoint &&
        this.configService.get<string>('R2_ACCESS_KEY_ID') &&
        this.configService.get<string>('R2_SECRET_ACCESS_KEY') &&
        this.configService.get<string>('R2_BUCKET_NAME'),
    );
  }

  async uploadObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.getBucketName(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    if (!key) return;
    try {
      await this.getClient().send(
        new DeleteObjectCommand({
          Bucket: this.getBucketName(),
          Key: key,
        }),
      );
    } catch (error: unknown) {
      const name =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name?: unknown }).name)
          : '';
      if (name === 'NoSuchKey') {
        this.logger.warn(`R2 object already missing during delete: ${key}`);
        return;
      }
      throw error;
    }
  }

  async getPresignedDownloadUrl(
    key: string,
    fileName: string,
    expiresInSeconds = 60,
  ): Promise<string> {
    const safeFileName = fileName.replace(/["\r\n]/g, '_');
    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({
        Bucket: this.getBucketName(),
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safeFileName}"`,
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}
