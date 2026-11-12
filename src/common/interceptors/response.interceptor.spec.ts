import { CallHandler, ExecutionContext, HttpStatus } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ResponseInterceptor } from './response.interceptor.js';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  const createContext = (method: string, statusCode: number): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, url: '/api/students' }),
        getResponse: () => ({ statusCode }),
      }),
    }) as unknown as ExecutionContext;

  it('wraps raw data into ApiResponse envelope', async () => {
    const next: CallHandler = { handle: () => of({ id: 'STU-2026-001' }) };
    const result = await firstValueFrom(
      interceptor.intercept(createContext('POST', HttpStatus.CREATED), next),
    );

    expect(result).toMatchObject({
      success: true,
      message: 'Resource created successfully',
      data: { id: 'STU-2026-001' },
      path: '/api/students',
    });
    expect(result.timestamp).toBeDefined();
  });

  it('preserves responses already formatted with success and message', async () => {
    const preformatted = {
      success: true,
      message: 'Custom message',
      data: [],
      timestamp: '2026-11-11T00:00:00.000Z',
    };
    const next: CallHandler = { handle: () => of(preformatted) };
    const result = await firstValueFrom(
      interceptor.intercept(createContext('GET', HttpStatus.OK), next),
    );

    expect(result).toEqual(preformatted);
  });
});
