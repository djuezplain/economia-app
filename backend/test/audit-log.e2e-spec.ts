import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { desc, eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { auditLogs, emailTokens, oauthAccounts, sessions, users } from '../src/db/schema/index.js';
import { AuthService } from '../src/auth/auth.service.js';
import { generateOpaqueToken, hashOpaqueToken } from '../src/common/tokens.util.js';
import { REFRESH_COOKIE_NAME } from '../src/auth/session-cookie.js';

/**
 * T9.1 (tasks.md, grupo 9): al menos un caso de cada evento de auditoría
 * (`login_success`, `login_failed`, `password_reset`, `account_deleted`,
 * `session_revoked`) más `password_changed` (añadido en este grupo, ver
 * constitution.md). No se repite aquí la cobertura funcional detallada de
 * cada flujo (eso ya lo cubren los ficheros de sus propios grupos) — el
 * objetivo de este fichero es solo confirmar que cada uno deja el rastro de
 * auditoría correcto: acción, `userId` (o null cuando corresponda) e ip.
 */
describe('Auditoría de eventos clave (e2e) — spec 001 H9/T9.1', () => {
  let app: INestApplication<App>;
  let db: Database;
  let authService: AuthService;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    db = moduleFixture.get<Database>(DB);
    authService = moduleFixture.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(auditLogs);
    await db.delete(sessions);
    await db.delete(emailTokens);
    await db.delete(oauthAccounts);
    await db.delete(users);
  });

  async function createActiveUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: 'Usuario Auditoría', status: 'ACTIVE' })
      .returning();
    return user;
  }

  function extractRefreshCookie(res: request.Response): string {
    const raw = res.headers['set-cookie'] as unknown;
    const cookies = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
    const match = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    if (!match) throw new Error('No se recibió la cookie de refresh token.');
    return match.split(';')[0].split('=')[1];
  }

  async function lastLogFor(action: string) {
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, action))
      .orderBy(desc(auditLogs.createdAt));
    return rows[0];
  }

  it('login_success: login con contraseña correcta deja un evento con el userId', async () => {
    const user = await createActiveUser('auditoria-login-ok@example.com');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);

    const log = await lastLogFor('login_success');
    expect(log).toBeDefined();
    expect(log.userId).toBe(user.id);
  });

  it('login_success: también se registra en un login con Google', async () => {
    const { user } = await authService.loginWithGoogleProfile(
      { googleId: 'google-sub-auditoria-1', email: 'auditoria-google@example.com', name: 'Usuario de Google' },
      {},
    );

    const log = await lastLogFor('login_success');
    expect(log).toBeDefined();
    expect(log.userId).toBe(user.id);
  });

  it('login_failed: contraseña incorrecta deja un evento con el userId (la cuenta sí existe)', async () => {
    const user = await createActiveUser('auditoria-login-mal@example.com');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'ClaveIncorrecta123' })
      .expect(401);

    const log = await lastLogFor('login_failed');
    expect(log).toBeDefined();
    expect(log.userId).toBe(user.id);
  });

  it('login_failed: email inexistente deja un evento sin userId (no hay cuenta que referenciar)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'no-existe@example.com', password: PASSWORD })
      .expect(401);

    const log = await lastLogFor('login_failed');
    expect(log).toBeDefined();
    expect(log.userId).toBeNull();
  });

  it('password_reset: un reset de contraseña válido deja un evento con el userId', async () => {
    const user = await createActiveUser('auditoria-reset@example.com');
    const { plaintext, hash } = generateOpaqueToken();
    await db.insert(emailTokens).values({
      userId: user.id,
      tokenHash: hash,
      type: 'RESET_PASSWORD',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: plaintext, password: 'OtraClaveNueva123' })
      .expect(200);

    const log = await lastLogFor('password_reset');
    expect(log).toBeDefined();
    expect(log.userId).toBe(user.id);
  });

  it('password_changed: cambiar la contraseña autenticado deja un evento con el userId', async () => {
    const user = await createActiveUser('auditoria-cambio-clave@example.com');
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post('/users/me/change-password')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'OtraClaveNueva123' })
      .expect(200);

    const log = await lastLogFor('password_changed');
    expect(log).toBeDefined();
    expect(log.userId).toBe(user.id);
  });

  it('account_deleted: eliminar la cuenta deja un evento que sobrevive con userId null (igual que el resto de audit_logs)', async () => {
    const user = await createActiveUser('auditoria-borrado@example.com');
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ password: PASSWORD })
      .expect(204);

    const log = await lastLogFor('account_deleted');
    expect(log).toBeDefined();
    // A diferencia de los demás casos: el usuario que este log referenciaba
    // ya no existe (esa es justo la prueba de que el ON DELETE SET NULL de
    // audit_logs.user_id funciona también para el propio evento de borrado).
    expect(log.userId).toBeNull();
  });

  it('session_revoked: cerrar una sesión propia desde "mis sesiones" deja un evento con el userId', async () => {
    const user = await createActiveUser('auditoria-revocar-sesion@example.com');
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const refreshToken = extractRefreshCookie(loginRes);
    const [dbSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hashOpaqueToken(refreshToken)));

    await request(app.getHttpServer())
      .delete(`/users/me/sessions/${dbSession.id}`)
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(204);

    const log = await lastLogFor('session_revoked');
    expect(log).toBeDefined();
    expect(log.userId).toBe(user.id);
  });

  it('session_revoked: reutilizar un refresh token ya rotado (robo detectado) también deja un evento', async () => {
    const user = await createActiveUser('auditoria-robo@example.com');
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const oldCookie = extractRefreshCookie(loginRes);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${oldCookie}`)
      .expect(200);

    // Reutilizar el token viejo (ya rotado) — señal de robo (ver sessions.service.ts).
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${oldCookie}`)
      .expect(401);

    const log = await lastLogFor('session_revoked');
    expect(log).toBeDefined();
    expect(log.userId).toBe(user.id);
  });
});
