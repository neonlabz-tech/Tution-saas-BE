import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  ErrorResponse,
  ValidationErrorDetail,
} from '../interfaces/api-response.interface.js';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const message = this.normalizeMessage(exceptionResponse, exception.message);
    const validationErrors = this.extractValidationErrors(
      exceptionResponse,
      exception,
    );

    const formattedMessage = Array.isArray(message)
      ? message.join(', ')
      : message || 'An error occurred';

    const errorResponse: ErrorResponse = {
      success: false,
      message: formattedMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: {
        code: this.getErrorCode(status),
        statusCode: status,
        details: validationErrors.length > 0 ? validationErrors : undefined,
      },
    };

    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${formattedMessage}`,
      exception.stack,
    );

    response.status(status).json(errorResponse);
  }

  private normalizeMessage(
    exceptionResponse: unknown,
    fallback: string,
  ): string | string[] {
    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      return (exceptionResponse as { message: string | string[] }).message;
    }

    return fallback;
  }

  private extractValidationErrors(
    exceptionResponse: unknown,
    exception: HttpException,
  ): ValidationErrorDetail[] {
    if (!exceptionResponse || typeof exceptionResponse !== 'object') {
      return this.extractValidationErrorsFromMessage(exception.message);
    }

    const resp = exceptionResponse as Record<string, any>;

    if (resp.error && Array.isArray(resp.error.details)) {
      return resp.error.details as ValidationErrorDetail[];
    }

    if (Array.isArray(resp.details)) {
      return resp.details as ValidationErrorDetail[];
    }

    if (Array.isArray(resp.errors)) {
      return resp.errors as ValidationErrorDetail[];
    }

    const detailsFromMessage = this.extractValidationErrorsFromMessage(
      resp.message as string | string[] | undefined,
    );
    if (detailsFromMessage.length > 0) {
      return detailsFromMessage;
    }

    const exAny = exception as unknown as Record<string, any>;
    if (Array.isArray(exAny.validationErrors)) {
      return exAny.validationErrors as ValidationErrorDetail[];
    }

    if (Array.isArray(exAny.details)) {
      return exAny.details as ValidationErrorDetail[];
    }

    return [];
  }

  private extractValidationErrorsFromMessage(
    message: string | string[] | undefined,
  ): ValidationErrorDetail[] {
    if (!message) {
      return [];
    }

    if (Array.isArray(message)) {
      return message.map((msg, index) => ({
        field: `field_${index}`,
        message: msg,
      }));
    }

    return [{ field: 'general', message }];
  }

  private getErrorCode(status: number): string {
    const errorCodeMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
    };

    return errorCodeMap[status] || 'ERROR';
  }
}
