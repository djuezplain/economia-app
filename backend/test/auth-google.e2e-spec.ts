import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { and, eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { oauthAccounts, sessions, users } from '../src/db/schema/index.js';
import { AuthService } from '../src/auth/auth.service.js';
import type { GoogleProfile } from '../src/auth/google/google.strategy.js';

describe('Login con Google (e2e) — spec 001 H3', () => {
  let app: INestApplication<App>;
  let db: Database;
  let authService: AuthService;

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

  // GOOGLE_CLIENT_ID/SECRET están vacíos en .env.test (constitution.md — el
  // proyecto sigue funcionando en local sin credenciales de Google reales
  // todavía), así que las rutas HTTP reales se prueban aquí solo en su
  // comportamiento "no configurado". El flujo de creación/vinculación de
  // cuenta (que es donde vive la lógica de negocio de H3) se prueba
  // directamente contra `AuthService.loginWithGoogleProfile`, simulando el
  // perfil que en producción vendría ya verificado por `GoogleStrategy` tras
  // el intercambio real con Google.
  describe('rutas HTTP sin credenciales de Google configuradas', () => {
    it('GET /auth/google responde 503', async () => {
      await request(app.getHttpServer()).get('/auth/google').expect(503);
    });

    it('GET /auth/google/callback responde 503', async () => {
      await request(app.getHttpServer()).get('/auth/google/callback').expect(503);
    });
  });

  describe('AuthService.loginWithGoogleProfile', () => {
    const device = { userAgent: 'vitest', ipAddress: '127.0.0.1' };

    it('con un email nuevo, crea un usuario ACTIVE (sin contraseña) y lo vincula a Google', async () => {
      const profile: GoogleProfile = { googleId: 'google-sub-1', email: 'nuevo-google@example.com', name: 'Nueva Cuenta' };

      const result = await authService.loginWithGoogleProfile(profile, device);

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.user).toMatchObject({ email: profile.email, name: profile.name, status: 'ACTIVE' });

      const [createdUser] = await db.select().from(users).where(eq(users.email, profile.email));
      expect(createdUser.passwordHash).toBeNull();
      expect(createdUser.status).toBe('ACTIVE');

      const links = await db
        .select()
        .from(oauthAccounts)
        .where(and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerUserId, profile.googleId)));
      expect(links).toHaveLength(1);
      expect(links[0].userId).toBe(createdUser.id);
    });

    it('con un email ya registrado por contraseña, vincula la cuenta de Google sin duplicar el usuario', async () => {
      const passwordHash = await argon2.hash('Contraseña-Segura-123', { type: argon2.argon2id });
      const [existingUser] = await db
        .insert(users)
        .values({ email: 'ya-registrado@example.com', passwordHash, name: 'Usuario Existente', status: 'ACTIVE' })
        .returning();

      const profile: GoogleProfile = {
        googleId: 'google-sub-2',
        email: existingUser.email,
        name: 'Usuario Existente (Google)',
      };

      const result = await authService.loginWithGoogleProfile(profile, device);

      expect(result.user.id).toBe(existingUser.id);

      const allUsers = await db.select().from(users).where(eq(users.email, existingUser.email));
      expect(allUsers).toHaveLength(1); // no se ha duplicado

      const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, existingUser.id));
      expect(links).toHaveLength(1);
      expect(links[0].providerUserId).toBe(profile.googleId);
    });

    it('un segundo login con el mismo googleId reutiliza el mismo usuario (no crea uno nuevo)', async () => {
      const profile: GoogleProfile = { googleId: 'google-sub-3', email: 'recurrente@example.com', name: 'Recurrente' };

      const first = await authService.loginWithGoogleProfile(profile, device);
      const second = await authService.loginWithGoogleProfile(profile, device);

      expect(second.user.id).toBe(first.user.id);

      const allUsers = await db.select().from(users).where(eq(users.email, profile.email));
      expect(allUsers).toHaveLength(1);

      const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, first.user.id));
      expect(links).toHaveLength(1);
    });

    it('un login por Google correcto limpia un bloqueo previo por intentos fallidos de contraseña', async () => {
      const passwordHash = await argon2.hash('Contraseña-Segura-123', { type: argon2.argon2id });
      const [existingUser] = await db
        .insert(users)
        .values({
          email: 'bloqueado-google@example.com',
          passwordHash,
          name: 'Bloqueado',
          status: 'ACTIVE',
          failedLoginCount: 4,
          lockedUntil: new Date(Date.now() + 60_000),
        })
        .returning();

      const profile: GoogleProfile = {
        googleId: 'google-sub-4',
        email: existingUser.email,
        name: 'Bloqueado (Google)',
      };

      await authService.loginWithGoogleProfile(profile, device);

      const [updated] = await db.select().from(users).where(eq(users.id, existingUser.id));
      expect(updated.failedLoginCount).toBe(0);
      expect(updated.lockedUntil).toBeNull();
    });
  });
});
