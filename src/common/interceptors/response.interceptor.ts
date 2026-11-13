import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiResponse } from '../interfaces/api-response.interface.js';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<unknown>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    return next.handle().pipe(
      map((data: unknown) => {
        const statusCode = response.statusCode || HttpStatus.OK;

        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'message' in data
        ) {
          return data as ApiResponse<unknown>;
        }

        let message = 'Success';
        if (request.method === 'POST' && statusCode === HttpStatus.CREATED) {
          message = 'Resource created successfully';
        } else if (request.method === 'PUT' || request.method === 'PATCH') {
          message = 'Resource updated successfully';
        } else if (request.method === 'DELETE') {
          message = 'Resource deleted successfully';
        } else if (request.method === 'GET') {
          message = 'Data retrieved successfully';
        }

        const apiResponse: ApiResponse<unknown> = {
          success: true,
          message,
          data,
          timestamp: new Date().toISOString(),
          path: request.url,
        };

        return apiResponse;
      }),
    );
  }
}
