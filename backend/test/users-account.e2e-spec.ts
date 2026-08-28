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
import { auditLogs, categories, emailTokens, oauthAccounts, sessions, transactions, users } from '../src/db/schema/index.js';
import { AuthService } from '../src/auth/auth.service.js';

describe('Exportar y eliminar cuenta (e2e) — spec 001 H8', () => {
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
      .values({ email, passwordHash, name: 'Usuario de Prueba', status: 'ACTIVE' })
      .returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  describe('GET /users/me/export', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/users/me/export').expect(401);
    });

    it('sin movimientos, devuelve el perfil con economicData vacío pero con la forma real (H8 criterio 1)', async () => {
      const user = await createActiveUser('exportar-vacio@example.com');
      const accessToken = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/users/me/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('exportedAt');
      expect(res.body.profile).toMatchObject({ id: user.id, email: user.email, name: 'Usuario de Prueba' });
      expect(res.body.profile).not.toHaveProperty('passwordHash');
      expect(res.body.economicData).toEqual({ categories: [], transactions: [] });
    });

    // spec 002, T2.2: desde que existen categorías/movimientos reales (grupo
    // 2), el export deja de ser un placeholder — se avisó de este cambio al
    // revisar spec.md de la 002, pero no quedó anotado en plan.md; corregido
    // aquí como hueco encontrado, no como cambio de alcance (ver tasks.md
    // de la spec 002, T2.2).
    it('con movimientos reales, el export los incluye completos (spec 002, T2.2)', async () => {
      const owner = await createActiveUser('exportar-datos-dueno@example.com');
      const other = await createActiveUser('exportar-datos-otro@example.com');
      const [category] = await db
        .insert(categories)
        .values({ userId: owner.id, type: 'INCOME', name: 'Nómina' })
        .returning();
      await db.insert(transactions).values([
        { userId: owner.id, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'Nómina agosto', amount: '2000.00' },
        { userId: other.id, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'No debería salir', amount: '999.00' },
      ]);
      const accessToken = await login(owner.email);

      const res = await request(app.getHttpServer())
        .get('/users/me/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.economicData.categories).toHaveLength(1);
      expect(res.body.economicData.categories[0]).toMatchObject({ id: category.id, name: 'Nómina' });
      expect(res.body.economicData.transactions).toHaveLength(1);
      expect(res.body.economicData.transactions[0]).toMatchObject({ concept: 'Nómina agosto', amount: '2000.00' });
    });
  });

  describe('DELETE /users/me', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).delete('/users/me').send({ password: PASSWORD }).expect(401);
    });

    it('sin contraseña en el body (cuenta con contraseña), responde 400 y no borra nada', async () => {
      const user = await createActiveUser('eliminar-sin-clave@example.com');
      const accessToken = await login(user.email);

      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      const [stillThere] = await db.select().from(users).where(eq(users.id, user.id));
      expect(stillThere).toBeDefined();
    });

    it('con la contraseña incorrecta, responde 401 y no borra nada', async () => {
      const user = await createActiveUser('eliminar-clave-incorrecta@example.com');
      const accessToken = await login(user.email);

      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password: 'ClaveIncorrecta123' })
        .expect(401);

      const [stillThere] = await db.select().from(users).where(eq(users.id, user.id));
      expect(stillThere).toBeDefined();
    });

    it('con la contraseña correcta, borra la cuenta de inmediato y en cascada (H8 criterios 2 y 3)', async () => {
      const user = await createActiveUser('eliminar-correcto@example.com');
      const accessToken = await login(user.email);

      // Rastro que debe sobrevivir al borrado (auditLogs.userId → SET NULL, no se borra el log).
      const [log] = await db
        .insert(auditLogs)
        .values({ userId: user.id, action: 'test_seed' })
        .returning();

      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password: PASSWORD })
        .expect(204);

      const [deletedUser] = await db.select().from(users).where(eq(users.id, user.id));
      expect(deletedUser).toBeUndefined();

      const remainingSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(remainingSessions).toHaveLength(0);

      // El log de auditoría sobrevive, pero ya no apunta a ningún usuario.
      const [survivingLog] = await db.select().from(auditLogs).where(eq(auditLogs.id, log.id));
      expect(survivingLog).toBeDefined();
      expect(survivingLog.userId).toBeNull();

      // Tras el borrado, ni siquiera las credenciales correctas dan acceso (criterio 3).
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);

      // El propio access token (todavía no caducado) tampoco sirve ya para nada:
      // AuthGuard vuelve a comprobar el usuario contra la BD en cada petición.
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('en una cuenta sin contraseña (solo Google), exige y valida el email de confirmación en su lugar', async () => {
      const { accessToken, user } = await authService.loginWithGoogleProfile(
        { googleId: 'google-sub-eliminar-1', email: 'solo-google-eliminar@example.com', name: 'Usuario de Google' },
        {},
      );

      // El perfil expone hasPassword: false — es lo que le dice al frontend
      // qué formulario de confirmación mostrar (H8).
      const profileRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(profileRes.body.hasPassword).toBe(false);

      // Sin confirmEmail → 400.
      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      // Con un email que no coincide → 401, no borra.
      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ confirmEmail: 'otro@example.com' })
        .expect(401);
      const [stillThere] = await db.select().from(users).where(eq(users.id, user.id));
      expect(stillThere).toBeDefined();

      // Con el email correcto → 204, sí borra.
      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(204);
      const [deletedUser] = await db.select().from(users).where(eq(users.id, user.id));
      expect(deletedUser).toBeUndefined();
    });
  });
});
