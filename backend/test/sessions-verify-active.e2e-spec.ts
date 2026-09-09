import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { sessions, users } from '../src/db/schema/index.js';
import { SessionsService } from '../src/auth/sessions.service.js';
import { REFRESH_COOKIE_NAME } from '../src/auth/session-cookie.js';

/**
 * Spec 032 H4, plan.md §9.5 (T5.4): `SessionsService.verifyActive()` — la
 * misma validación de "sesión existe, no revocada, no caducada" que ya usa
 * `rotate()`, pero de solo lectura (no rota nada). La usará `GET
 * /auth/drive/connect` (T6.1, todavía no implementado) para identificar al
 * usuario a partir de la cookie de refresh en una navegación completa del
 * navegador — este test la ejercita directamente contra la BD de test, sin
 * esperar a que exista esa ruta.
 */
describe('SessionsService.verifyActive() — spec 032 H4, plan.md §9.5', () => {
  let app: INestApplication<App>;
  let db: Database;
  let sessionsService: SessionsService;

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
    sessionsService = moduleFixture.get<SessionsService>(SessionsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(users);
  });

  async function createActiveUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: 'Usuario Drive', status: 'ACTIVE' })
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

  async function login(email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { accessToken: res.body.accessToken as string, refreshToken: extractRefreshCookie(res) };
  }

  it('con un refresh token válido, devuelve el userId de esa sesión', async () => {
    const user = await createActiveUser('drive-verify-active@example.com');
    const { refreshToken } = await login(user.email);

    const result = await sessionsService.verifyActive(refreshToken);
    expect(result.userId).toBe(user.id);
  });

  it('no rota el token — llamarlo dos veces seguidas con el mismo token no falla la segunda vez', async () => {
    const user = await createActiveUser('drive-verify-no-rotate@example.com');
    const { refreshToken } = await login(user.email);

    await sessionsService.verifyActive(refreshToken);
    const second = await sessionsService.verifyActive(refreshToken);
    expect(second.userId).toBe(user.id);
  });

  it('con un token que no existe, lanza', async () => {
    await expect(sessionsService.verifyActive('token-inventado-que-no-existe')).rejects.toThrow();
  });

  it('con un token revocado (logout), lanza', async () => {
    const user = await createActiveUser('drive-verify-revoked@example.com');
    const { accessToken, refreshToken } = await login(user.email);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshToken}`)
      .expect(200);

    await expect(sessionsService.verifyActive(refreshToken)).rejects.toThrow();
  });
});
