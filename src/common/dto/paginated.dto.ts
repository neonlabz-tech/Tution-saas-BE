export class PaginatedDto<T, M = undefined> {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  data: T[];
  metrics?: M;

  constructor(
    page: number,
    limit: number,
    total: number,
    data: T[],
    metrics?: M,
  ) {
    this.page = page;
    this.limit = limit;
    this.total = total;
    this.totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    this.data = data;
    if (metrics !== undefined) {
      this.metrics = metrics;
    }
  }
}
