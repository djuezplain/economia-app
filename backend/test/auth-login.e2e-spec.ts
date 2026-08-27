import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { sessions, users } from '../src/db/schema/index.js';
import { REFRESH_COOKIE_NAME } from '../src/auth/session-cookie.js';

describe('Login y sesiones (e2e) — spec 001 H4', () => {
  let app: INestApplication<App>;
  let db: Database;

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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(users);
  });

  async function createActiveUser(email = 'login@example.com', password = PASSWORD) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: 'Login Test', status: 'ACTIVE' })
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

  describe('POST /auth/login', () => {
    it('con credenciales correctas devuelve accessToken, cookie de refresh y crea una Session', async () => {
      const user = await createActiveUser();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ id: user.id, email: user.email });
      expect(res.body.refreshToken).toBeUndefined(); // nunca en el body, solo en la cookie httpOnly

      expect(res.headers['set-cookie']).toBeDefined();

      const dbSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(dbSessions).toHaveLength(1);
    });

    it('con email inexistente responde 401 con mensaje genérico', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'no-existe@example.com', password: 'lo-que-sea-123' })
        .expect(401);

      expect(res.body.message).toContain('incorrectos');
    });

    it('con contraseña incorrecta responde 401 con el mismo mensaje genérico y no crea Session', async () => {
      const user = await createActiveUser();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'password-incorrecta-123' })
        .expect(401);

      expect(res.body.message).toContain('incorrectos');

      const dbSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(dbSessions).toHaveLength(0);

      const [updated] = await db.select().from(users).where(eq(users.id, user.id));
      expect(updated.failedLoginCount).toBe(1);
    });

    it('bloquea la cuenta tras 5 intentos fallidos consecutivos en 15 minutos', async () => {
      const user = await createActiveUser('bloqueo@example.com');

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: user.email, password: 'incorrecta' })
          .expect(401);
      }

      const [locked] = await db.select().from(users).where(eq(users.id, user.id));
      expect(locked.lockedUntil).not.toBeNull();
      expect(locked.failedLoginCount).toBe(0); // se resetea al activar el bloqueo

      // Incluso con la contraseña correcta, debe seguir rechazando mientras está bloqueada.
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);

      expect(res.body.message).toContain('bloqueada');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rota el refresh token y emite un nuevo access token', async () => {
      const user = await createActiveUser('refresh@example.com');
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);

      const oldCookie = extractRefreshCookie(loginRes);

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${oldCookie}`)
        .expect(200);

      expect(refreshRes.body.accessToken).toEqual(expect.any(String));
      // Nota: no se compara con el accessToken de login — un JWT HS256 es
      // determinista dado el mismo payload (`sub`) y el mismo segundo de
      // `iat`/`exp`, así que dos emisiones dentro del mismo segundo pueden
      // coincidir byte a byte sin que eso sea un fallo de seguridad (ambos
      // son válidos para el mismo usuario). Lo que sí es crítico — y se
      // verifica a continuación — es que el refresh token SÍ cambia.

      const newCookie = extractRefreshCookie(refreshRes);
      expect(newCookie).not.toEqual(oldCookie);

      const dbSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(dbSessions).toHaveLength(2); // la vieja (revocada) + la nueva
      expect(dbSessions.filter((s) => s.revokedAt !== null)).toHaveLength(1);
    });

    it('revoca TODAS las sesiones si se reutiliza un refresh token ya rotado (robo detectado)', async () => {
      const user = await createActiveUser('robo@example.com');
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const oldCookie = extractRefreshCookie(loginRes);

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${oldCookie}`)
        .expect(200);
      const newCookie = extractRefreshCookie(refreshRes);

      // Reutilizar el token viejo (ya rotado) — señal de robo.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${oldCookie}`)
        .expect(401);

      const dbSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(dbSessions.length).toBeGreaterThan(0);
      expect(dbSessions.every((s) => s.revokedAt !== null)).toBe(true);

      // Incluso el token "nuevo" (legítimo) queda invalidado por la revocación total.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${newCookie}`)
        .expect(401);
    });

    it('sin cookie de refresh responde 401', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoca la sesión actual; el refresh token deja de servir para refrescar', async () => {
      const user = await createActiveUser('logout@example.com');
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const cookie = extractRefreshCookie(loginRes);
      const accessToken = loginRes.body.accessToken as string;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`)
        .expect(200);

      const [session] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(session.revokedAt).not.toBeNull();

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`)
        .expect(401);
    });

    it('sin access token responde 401 (AuthGuard)', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('con un access token inválido responde 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', 'Bearer token-que-no-existe')
        .expect(401);
    });
  });
});
