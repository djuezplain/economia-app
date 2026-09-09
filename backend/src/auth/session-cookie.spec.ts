import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { refreshCookieOptions } from './session-cookie.js';

function fakeRequest(secure: boolean): Request {
  return { secure } as Request;
}

/**
 * Bug real encontrado configurando spec 032 H4 contra un despliegue real
 * (Raspberry Pi, LAN por HTTP plano): `secure` decidido por `NODE_ENV`
 * marcaba siempre la cookie como segura en producción, y el navegador
 * nunca la guardaba sobre HTTP sin cifrar — cualquier acción que
 * dependiera de ella (refresco silencioso, `GET /auth/drive/connect`)
 * fallaba en silencio, deslogueando al recargar la página. Corregido
 * usando `req.secure` (ver `main.ts`, `app.set('trust proxy', true)` para
 * que también funcione detrás de un proxy TLS como el Cloudflare Tunnel
 * opcional, deploy/README.md §9).
 */
describe('refreshCookieOptions', () => {
  it('secure es false en una petición por HTTP plano (LAN sin HTTPS)', () => {
    expect(refreshCookieOptions(fakeRequest(false)).secure).toBe(false);
  });

  it('secure es true en una petición HTTPS (directa, o vía proxy con X-Forwarded-Proto de confianza)', () => {
    expect(refreshCookieOptions(fakeRequest(true)).secure).toBe(true);
  });

  it('el resto de atributos no dependen de la petición', () => {
    const options = refreshCookieOptions(fakeRequest(false));
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/auth' });
  });
});
