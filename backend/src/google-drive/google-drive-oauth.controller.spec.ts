import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { GoogleDriveOAuthController } from './google-drive-oauth.controller.js';
import type { GoogleDriveService } from './google-drive.service.js';
import type { SessionsService } from '../auth/sessions.service.js';

/**
 * Spec 032 H4, plan.md §9.5 (T6.5). Prueba directa de la clase (sin pasar
 * por HTTP/guards): `GET /auth/drive/connect` y `/callback` solo se pueden
 * ejercitar por HTTP con credenciales reales de Google configuradas (que
 * este entorno no tiene, igual que el login — ver
 * `google-drive-connection.e2e-spec.ts`), así que la lógica propia del
 * controlador (generar y verificar `state`, construir las URLs de
 * redirección) se prueba aquí instanciando la clase con dobles de sus
 * dependencias.
 */
describe('GoogleDriveOAuthController', () => {
  const FRONTEND_URL = 'http://localhost:5173';

  let googleDrive: { buildAuthUrl: ReturnType<typeof vi.fn>; saveConnectionFromCode: ReturnType<typeof vi.fn> };
  let sessions: { verifyActive: ReturnType<typeof vi.fn> };
  let jwt: { signAsync: ReturnType<typeof vi.fn>; verifyAsync: ReturnType<typeof vi.fn> };
  let config: { getOrThrow: ReturnType<typeof vi.fn> };
  let controller: GoogleDriveOAuthController;

  beforeEach(() => {
    googleDrive = { buildAuthUrl: vi.fn(), saveConnectionFromCode: vi.fn() };
    sessions = { verifyActive: vi.fn() };
    jwt = { signAsync: vi.fn(), verifyAsync: vi.fn() };
    config = { getOrThrow: vi.fn().mockReturnValue(FRONTEND_URL) };
    controller = new GoogleDriveOAuthController(
      googleDrive as unknown as GoogleDriveService,
      sessions as unknown as SessionsService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  function fakeResponse() {
    return { redirect: vi.fn() } as unknown as Response & { redirect: ReturnType<typeof vi.fn> };
  }

  describe('connect', () => {
    it('sin cookie de refresh token, redirige a /login sin llamar a Google', async () => {
      const req = { cookies: {} } as unknown as Request;
      const res = fakeResponse();

      await controller.connect(req, res);

      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/login`);
      expect(googleDrive.buildAuthUrl).not.toHaveBeenCalled();
    });

    it('con un refresh token inválido (sesión revocada/caducada), redirige a /login', async () => {
      sessions.verifyActive.mockRejectedValue(new Error('Sesión inválida.'));
      const req = { cookies: { refresh_token: 'algo' } } as unknown as Request;
      const res = fakeResponse();

      await controller.connect(req, res);

      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/login`);
      expect(googleDrive.buildAuthUrl).not.toHaveBeenCalled();
    });

    it('con una sesión válida, firma un state con el userId y redirige a la URL de Google', async () => {
      sessions.verifyActive.mockResolvedValue({ userId: 'user-123' });
      jwt.signAsync.mockResolvedValue('signed-state-jwt');
      googleDrive.buildAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?...');
      const req = { cookies: { refresh_token: 'refresh-plaintext' } } as unknown as Request;
      const res = fakeResponse();

      await controller.connect(req, res);

      expect(sessions.verifyActive).toHaveBeenCalledWith('refresh-plaintext');
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'user-123' }, { expiresIn: '5m' });
      expect(googleDrive.buildAuthUrl).toHaveBeenCalledWith('signed-state-jwt');
      expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?...');
    });
  });

  describe('callback', () => {
    it('si Google devuelve un error (usuario canceló el consentimiento), redirige con error=access_denied', async () => {
      const res = fakeResponse();

      await controller.callback('code-x', 'state-x', 'access_denied', res);

      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/backup?driveConnected=0&error=access_denied`);
      expect(googleDrive.saveConnectionFromCode).not.toHaveBeenCalled();
    });

    it('sin code o sin state, redirige con error=access_denied', async () => {
      const res = fakeResponse();

      await controller.callback(undefined, undefined, undefined, res);

      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/backup?driveConnected=0&error=access_denied`);
    });

    it('con un state inválido o caducado, redirige con error=state, sin guardar nada', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      const res = fakeResponse();

      await controller.callback('code-x', 'state-invalido', undefined, res);

      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/backup?driveConnected=0&error=state`);
      expect(googleDrive.saveConnectionFromCode).not.toHaveBeenCalled();
    });

    it('sin refresh_token en la respuesta de Google, redirige con error=no_refresh_token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-123' });
      googleDrive.saveConnectionFromCode.mockResolvedValue({ ok: false, reason: 'no_refresh_token' });
      const res = fakeResponse();

      await controller.callback('code-x', 'state-valido', undefined, res);

      expect(googleDrive.saveConnectionFromCode).toHaveBeenCalledWith('user-123', 'code-x');
      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/backup?driveConnected=0&error=no_refresh_token`);
    });

    it('con éxito, redirige a /backup?driveConnected=1', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-123' });
      googleDrive.saveConnectionFromCode.mockResolvedValue({ ok: true });
      const res = fakeResponse();

      await controller.callback('code-x', 'state-valido', undefined, res);

      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/backup?driveConnected=1`);
    });
  });
});
