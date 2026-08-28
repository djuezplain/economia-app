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
import { hashOpaqueToken } from '../src/common/tokens.util.js';

describe('Gestión de sesiones activas (e2e) — spec 001 H6', () => {
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

  async function createActiveUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: 'Usuario Sesiones', status: 'ACTIVE' })
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

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { accessToken: res.body.accessToken as string, refreshToken: extractRefreshCookie(res) };
  }

  describe('GET /users/me/sessions', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/users/me/sessions').expect(401);
    });

    it('lista solo las sesiones activas del propio usuario, sin exponer el hash del token', async () => {
      const userA = await createActiveUser('sesiones-a@example.com');
      const userB = await createActiveUser('sesiones-b@example.com');

      const sessionA1 = await login(userA.email);
      await login(userA.email); // un "segundo dispositivo"
      await login(userB.email); // no debe aparecer en la lista de A

      const res = await request(app.getHttpServer())
        .get('/users/me/sessions')
        .set('Authorization', `Bearer ${sessionA1.accessToken}`)
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${sessionA1.refreshToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      for (const session of res.body) {
        expect(session).not.toHaveProperty('refreshTokenHash');
        expect(session).not.toHaveProperty('isCurrent'); // ver nota en sessions.service.ts: no se puede marcar de forma fiable sin meter el id de sesión en el JWT
        expect(session).toHaveProperty('id');
        expect(session).toHaveProperty('lastUsedAt');
      }

      // Sanity: la lista devuelta es exactamente el conjunto de sesiones de A en BD (ni de más, ni de menos).
      const dbSessionsA = await db.select().from(sessions).where(eq(sessions.userId, userA.id));
      expect(res.body.map((s: { id: string }) => s.id).sort()).toEqual(dbSessionsA.map((s) => s.id).sort());
    });

    it('una sesión revocada (por logout) deja de aparecer en la lista', async () => {
      const user = await createActiveUser('sesiones-logout@example.com');
      const session = await login(user.email);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${session.refreshToken}`)
        .expect(200);

      // El access token sigue siendo válido 15 min (H4): se puede seguir
      // usando para consultar la lista aunque la sesión ya esté revocada.
      const res = await request(app.getHttpServer())
        .get('/users/me/sessions')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(0);
    });
  });

  describe('DELETE /users/me/sessions/:id', () => {
    it('revoca una sesión propia y deja de servir para refrescar, sin afectar a las demás sesiones del usuario (regresión)', async () => {
      // Regresión: este era exactamente el escenario del bug de revocación en
      // cascada (ver sessions.service.ts, rotate()). Antes de distinguir el
      // `revokedReason`, el segundo `expect(...).expect(200)` de este test
      // fallaba con 401 — revocar session1 aquí "contaminaba" session2,
      // porque cualquier reutilización de un refresh token ya revocado se
      // trataba como robo y se revocaban TODAS las sesiones del usuario.
      const user = await createActiveUser('revocar-propia@example.com');
      const session1 = await login(user.email);
      const session2 = await login(user.email);

      const [dbSession1] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.refreshTokenHash, hashOpaqueToken(session1.refreshToken)));

      await request(app.getHttpServer())
        .delete(`/users/me/sessions/${dbSession1.id}`)
        .set('Authorization', `Bearer ${session1.accessToken}`)
        .expect(204);

      // La sesión revocada ya no sirve para refrescar...
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${session1.refreshToken}`)
        .expect(401);

      // ...pero la otra sesión del mismo usuario sigue intacta.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${session2.refreshToken}`)
        .expect(200);
    });

    it('aislamiento: intentar revocar la sesión de otro usuario devuelve 404, no 403 (no confirma que exista)', async () => {
      const userA = await createActiveUser('revocar-aislado-a@example.com');
      const userB = await createActiveUser('revocar-aislado-b@example.com');

      const sessionA = await login(userA.email);
      const sessionB = await login(userB.email);

      const [dbSessionB] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.refreshTokenHash, hashOpaqueToken(sessionB.refreshToken)));

      await request(app.getHttpServer())
        .delete(`/users/me/sessions/${dbSessionB.id}`)
        .set('Authorization', `Bearer ${sessionA.accessToken}`)
        .expect(404);

      // La sesión de B no ha sido tocada.
      const [stillActive] = await db.select().from(sessions).where(eq(sessions.id, dbSessionB.id));
      expect(stillActive.revokedAt).toBeNull();
    });

    it('con un id que no existe, responde 404', async () => {
      const user = await createActiveUser('revocar-inexistente@example.com');
      const session = await login(user.email);

      await request(app.getHttpServer())
        .delete('/users/me/sessions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(404);
    });

    it('con un id con formato inválido, responde 400', async () => {
      const user = await createActiveUser('revocar-formato-invalido@example.com');
      const session = await login(user.email);

      await request(app.getHttpServer())
        .delete('/users/me/sessions/no-es-un-uuid')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(400);
    });
  });
});

