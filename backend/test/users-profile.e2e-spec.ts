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
import { oauthAccounts, sessions, users } from '../src/db/schema/index.js';
import { AuthService } from '../src/auth/auth.service.js';
import { REFRESH_COOKIE_NAME } from '../src/auth/session-cookie.js';

describe('Gestión de perfil (e2e) — spec 001 H7', () => {
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
    await db.delete(sessions);
    await db.delete(oauthAccounts);
    await db.delete(users);
  });

  function extractRefreshCookie(res: request.Response): string {
    const raw = res.headers['set-cookie'] as unknown;
    const cookies = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
    const match = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    if (!match) throw new Error('No se recibió la cookie de refresh token.');
    return match.split(';')[0].split('=')[1];
  }

  async function createActiveUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: 'Usuario de Prueba', status: 'ACTIVE' })
      .returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { accessToken: res.body.accessToken as string, refreshToken: extractRefreshCookie(res) };
  }

  describe('GET /users/me', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('devuelve el perfil propio sin exponer el hash de contraseña', async () => {
      const user = await createActiveUser('perfil-get@example.com');
      const { accessToken } = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: user.id,
        email: user.email,
        name: 'Usuario de Prueba',
        currency: 'EUR',
        locale: 'es',
        status: 'ACTIVE',
      });
      expect(res.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('PATCH /users/me', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).patch('/users/me').send({ name: 'Nuevo Nombre' }).expect(401);
    });

    it('actualiza parcialmente solo los campos enviados (H7 criterio 1)', async () => {
      const user = await createActiveUser('perfil-patch@example.com');
      const { accessToken } = await login(user.email);

      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currency: 'USD' })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Usuario de Prueba', currency: 'USD', locale: 'es' });

      const res2 = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Nombre Nuevo', locale: 'en' })
        .expect(200);

      // El cambio anterior (currency: USD) persiste aunque no se repita en esta llamada.
      expect(res2.body).toMatchObject({ name: 'Nombre Nuevo', currency: 'USD', locale: 'en' });
    });

    it('rechaza una moneda con formato inválido sin tocar el perfil', async () => {
      const user = await createActiveUser('perfil-moneda-invalida@example.com');
      const { accessToken } = await login(user.email);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currency: 'euros' })
        .expect(400);

      const [row] = await db.select().from(users).where(eq(users.id, user.id));
      expect(row.currency).toBe('EUR');
    });

    it('rechaza intentar cambiar el email por este endpoint (no está en el DTO)', async () => {
      const user = await createActiveUser('perfil-sin-email@example.com');
      const { accessToken } = await login(user.email);

      // whitelist + forbidNonWhitelisted (main.ts): un campo no declarado en
      // el DTO falla explícitamente en vez de ignorarse en silencio.
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'otro@example.com' })
        .expect(400);
    });
  });

  describe('POST /users/me/change-password', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer())
        .post('/users/me/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'unaClaveNueva123' })
        .expect(401);
    });

    it('con la contraseña actual incorrecta, falla y no cambia nada', async () => {
      const user = await createActiveUser('cambiar-clave-incorrecta@example.com');
      const { accessToken } = await login(user.email);

      await request(app.getHttpServer())
        .post('/users/me/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'ClaveIncorrecta123', newPassword: 'unaClaveNueva123' })
        .expect(401);

      // La contraseña original sigue funcionando.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
    });

    it('con la contraseña actual correcta, la cambia y revoca todas las sesiones activas (H7 criterio 2)', async () => {
      const user = await createActiveUser('cambiar-clave-correcta@example.com');
      const session1 = await login(user.email);
      const session2 = await login(user.email); // "segundo dispositivo"

      await request(app.getHttpServer())
        .post('/users/me/change-password')
        .set('Authorization', `Bearer ${session1.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: 'unaClaveNueva123' })
        .expect(200);

      // La contraseña vieja ya no sirve para iniciar sesión...
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);

      // ...la nueva sí.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'unaClaveNueva123' })
        .expect(200);

      // Ambas sesiones anteriores (incluida la que hizo el cambio) quedan revocadas.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${session1.refreshToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${session2.refreshToken}`)
        .expect(401);
    });

    it('en una cuenta sin contraseña (solo Google), responde 400 en vez de comparar contra null', async () => {
      const { accessToken } = await authService.loginWithGoogleProfile(
        { googleId: 'google-sub-perfil-1', email: 'solo-google@example.com', name: 'Usuario de Google' },
        {},
      );

      await request(app.getHttpServer())
        .post('/users/me/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'cualquier-cosa123', newPassword: 'unaClaveNueva123' })
        .expect(400);
    });
  });
});
