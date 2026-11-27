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
        getResponse: () => ({ status: mockStatus, setHeader: vi.fn() }),
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

  it('sets Retry-After header and returns TOO_MANY_REQUESTS for 429', () => {
    const mockSetHeader = vi.fn();
    const hostWithHeader = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus, setHeader: mockSetHeader }),
        getRequest: () => ({ url: '/api/auth/login', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost;

    const exception = new HttpException(
      {
        message: 'Too many failed login attempts. Please try again after 60 seconds.',
        retryAfter: 60,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    filter.catch(exception, hostWithHeader);

    expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect(mockStatus).toHaveBeenCalledWith(429);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'TOO_MANY_REQUESTS',
          statusCode: 429,
        }),
      }),
    );
  });
});
