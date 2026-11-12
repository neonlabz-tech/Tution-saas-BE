import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ url: '/api/students', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('formats standard HttpException into ErrorResponse', () => {
    const exception = new HttpException('Student not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Student not found',
        path: '/api/students',
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          statusCode: 404,
        }),
      }),
    );
  });

  it('extracts validation details array from exception response', () => {
    const exception = new HttpException(
      {
        message: 'Validation failed',
        details: [{ field: 'email', message: 'Enter a valid email address' }],
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Validation failed',
        error: expect.objectContaining({
          code: 'BAD_REQUEST',
          statusCode: 400,
          details: [{ field: 'email', message: 'Enter a valid email address' }],
        }),
      }),
    );
  });
});
