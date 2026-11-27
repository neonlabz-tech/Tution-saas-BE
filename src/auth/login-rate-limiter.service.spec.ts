import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { LoginRateLimiterService } from './login-rate-limiter.service.js';

describe('LoginRateLimiterService', () => {
  let limiter: LoginRateLimiterService;

  beforeEach(() => {
    limiter = new LoginRateLimiterService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows initial attempts without locking', () => {
    const status = limiter.checkLockout('test@example.com');
    expect(status.isLocked).toBe(false);
    expect(status.retryAfter).toBe(0);
  });

  it('locks out after 5 consecutive failures', () => {
    const email = 'user@example.com';

    for (let i = 1; i <= 4; i++) {
      const res = limiter.recordFailure(email);
      expect(res.isLocked).toBe(false);
      expect(limiter.checkLockout(email).isLocked).toBe(false);
    }

    // 5th failure triggers lockout
    const fifth = limiter.recordFailure(email);
    expect(fifth.isLocked).toBe(true);
    expect(fifth.retryAfter).toBe(60);

    // Subsequent checks show locked
    const lockout = limiter.checkLockout(email);
    expect(lockout.isLocked).toBe(true);
    expect(lockout.retryAfter).toBeGreaterThan(0);
  });

  it('clears lockout on recordSuccess', () => {
    const email = 'user@example.com';
    for (let i = 0; i < 5; i++) {
      limiter.recordFailure(email);
    }
    expect(limiter.checkLockout(email).isLocked).toBe(true);

    limiter.recordSuccess(email);
    expect(limiter.checkLockout(email).isLocked).toBe(false);
  });

  it('unlocks after lockout duration elapses', () => {
    vi.useFakeTimers();
    const email = 'user@example.com';

    for (let i = 0; i < 5; i++) {
      limiter.recordFailure(email);
    }
    expect(limiter.checkLockout(email).isLocked).toBe(true);

    // Advance 61 seconds
    vi.advanceTimersByTime(61 * 1000);

    expect(limiter.checkLockout(email).isLocked).toBe(false);
  });

  it('throws standard 429 HttpException with retryAfter', () => {
    try {
      limiter.throwTooManyRequests(45);
      expect.fail('Should have thrown HttpException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const resp = err.getResponse();
      expect(resp.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(resp.retryAfter).toBe(45);
      expect(resp.message).toContain('45 seconds');
    }
  });
});
