import { CookieOptions } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
export const ACCESS_TOKEN_TTL = '15m';

/**
 * La cookie del refresh token solo se envía a los endpoints de auth que la
 * necesitan (login, refresh, logout) — reduce la superficie CSRF (plan.md §4).
 * Nota: el plan original asumía un prefijo /api que esta app no usa; el path
 * real son las rutas de /auth tal cual están montadas.
 */
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}
