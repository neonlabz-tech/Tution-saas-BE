import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface RateLimitStatus {
  isLocked: boolean;
  retryAfter: number;
}

interface AttemptRecord {
  failedAttempts: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

@Injectable()
export class LoginRateLimiterService {
  private readonly maxAttempts = 5;
  private readonly lockoutDurationSeconds = 60; // 60 seconds
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes failure window
  private readonly records = new Map<string, AttemptRecord>();

  checkLockout(key: string): RateLimitStatus {
    const record = this.records.get(key);
    if (!record) {
      return { isLocked: false, retryAfter: 0 };
    }

    const now = Date.now();

    // If currently locked out and lock duration hasn't expired
    if (record.lockedUntil && record.lockedUntil > now) {
      const retryAfter = Math.max(
        1,
        Math.ceil((record.lockedUntil - now) / 1000),
      );
      return { isLocked: true, retryAfter };
    }

    // If lockout duration has elapsed, clear record
    if (record.lockedUntil && record.lockedUntil <= now) {
      this.records.delete(key);
      return { isLocked: false, retryAfter: 0 };
    }

    // If sliding window has elapsed, clear record
    if (now - record.firstAttemptAt > this.windowMs) {
      this.records.delete(key);
      return { isLocked: false, retryAfter: 0 };
    }

    return { isLocked: false, retryAfter: 0 };
  }

  recordFailure(key: string): RateLimitStatus {
    const now = Date.now();
    let record = this.records.get(key);

    if (
      !record ||
      (now - record.firstAttemptAt > this.windowMs && !record.lockedUntil) ||
      (record.lockedUntil && record.lockedUntil <= now)
    ) {
      record = {
        failedAttempts: 1,
        firstAttemptAt: now,
        lockedUntil: null,
      };
      this.records.set(key, record);
      return { isLocked: false, retryAfter: 0 };
    }

    record.failedAttempts += 1;

    if (record.failedAttempts >= this.maxAttempts) {
      record.lockedUntil = now + this.lockoutDurationSeconds * 1000;
      return { isLocked: true, retryAfter: this.lockoutDurationSeconds };
    }

    return { isLocked: false, retryAfter: 0 };
  }

  recordSuccess(key: string): void {
    this.records.delete(key);
  }

  reset(): void {
    this.records.clear();
  }

  throwTooManyRequests(retryAfter: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many failed login attempts. Please try again after ${retryAfter} seconds.`,
        error: 'Too Many Requests',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
