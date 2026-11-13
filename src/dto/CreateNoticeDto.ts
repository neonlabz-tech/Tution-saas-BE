export class CreateNoticeDto {
  title: string;
  description: string;
  createdAt: Date;

  constructor(title: string, description: string, createdAt: Date) {
    this.title = title;
    this.description = description;
    this.createdAt = createdAt;
  }
}
