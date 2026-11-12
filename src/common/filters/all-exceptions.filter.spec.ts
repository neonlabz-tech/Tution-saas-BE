import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ url: '/api/students', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('handles unexpected non-HTTP errors as 500', () => {
    filter.catch(new Error('Database failure'), mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Database failure',
        path: '/api/students',
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500,
        },
      }),
    );
  });

  it('handles HttpException consistently', () => {
    filter.catch(
      new HttpException('Duplicate email', HttpStatus.CONFLICT),
      mockHost,
    );

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Duplicate email',
        error: expect.objectContaining({
          code: 'CONFLICT',
          statusCode: 409,
        }),
      }),
    );
  });
});
