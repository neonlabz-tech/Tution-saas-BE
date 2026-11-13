export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  timestamp: string;
  path?: string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T> {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface ValidationErrorDetail {
  field: string;
  message: string | string[];
  value?: unknown;
}

export interface ErrorResponse extends ApiResponse<never> {
  error?: {
    code: string;
    details?: ValidationErrorDetail[];
    statusCode: number;
  };
}
