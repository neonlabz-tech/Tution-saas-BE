import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'eduflow_token';

/** Converts a JWT-style duration string (e.g. '7d', '12h') into milliseconds. */
export function parseDurationToMs(duration: string): number {
  const match = duration.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * (multipliers[unit] ?? 1000);
}

/** Returns consistent cookie attributes for setting and clearing the auth cookie. */
export function getAuthCookieOptions(maxAgeMs?: number): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    ...(typeof maxAgeMs === 'number' ? { maxAge: maxAgeMs } : {}),
  };
}

/** Extracts a named cookie value from a raw Cookie header without external middleware. */
export function extractCookieToken(
  cookieHeader?: string,
  cookieName = AUTH_COOKIE_NAME,
): string | null {
  if (!cookieHeader) return null;
  const prefix = `${cookieName}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}
