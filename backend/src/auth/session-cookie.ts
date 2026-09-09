import { CookieOptions, Request } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
export const ACCESS_TOKEN_TTL = '15m';

/**
 * La cookie del refresh token solo se envía a los endpoints de auth que la
 * necesitan (login, refresh, logout) — reduce la superficie CSRF (plan.md §4).
 * Nota: el plan original asumía un prefijo /api que esta app no usa; el path
 * real son las rutas de /auth tal cual están montadas.
 *
 * `secure: req.secure` (bug encontrado configurando spec 032 H4 contra un
 * despliegue real): antes era `NODE_ENV === 'production'`, pero el
 * despliegue en Raspberry Pi (deploy/README.md §1, modo por defecto) corre
 * en producción **por HTTP plano en LAN, sin HTTPS** — con `secure: true`
 * el navegador nunca llega a guardar la cookie sobre HTTP, así que el
 * refresco silencioso de sesión fallaba en silencio en cualquier
 * despliegue sin HTTPS delante (se detectó al ver que recargar la página
 * desloguea, y que `GET /auth/drive/connect`, que depende explícitamente
 * de esta cookie, redirigía siempre a /login). `req.secure` refleja la
 * conexión real petición a petición — `true` con HTTPS directo o, gracias
 * a `app.set('trust proxy', true)` en `main.ts`, también con HTTPS
 * terminado en un proxy delante que reenvíe `X-Forwarded-Proto: https`
 * (el caso del Cloudflare Tunnel opcional, deploy/README.md §9) — y
 * `false` en LAN por HTTP plano, que es exactamente cuándo el navegador sí
 * necesita poder guardarla.
 */
export function refreshCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax',
    path: '/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}
