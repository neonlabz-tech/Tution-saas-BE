export interface PaginationParams {
  limit: number;
  page: number;
  skip: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function getPaginationParams(
  limit?: number | string,
  page?: number | string,
): PaginationParams {
  const parsedLimit = Number(limit);
  const parsedPage = Number(page);

  const validatedLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const validatedPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

  return {
    limit: validatedLimit,
    page: validatedPage,
    skip: (validatedPage - 1) * validatedLimit,
  };
}
