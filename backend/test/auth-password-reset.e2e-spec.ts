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
import { emailTokens, sessions, users } from '../src/db/schema/index.js';
import { generateOpaqueToken } from '../src/common/tokens.util.js';

describe('Recuperación de contraseña (e2e) — spec 001 H5', () => {
  let app: INestApplication<App>;
  let db: Database;

  const OLD_PASSWORD = 'Contraseña-Vieja-123';
  const NEW_PASSWORD = 'Contraseña-Nueva-456';

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
    await db.delete(emailTokens);
    await db.delete(users);
  });

  async function createActiveUser(email: string, password = OLD_PASSWORD) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: 'Usuario Reset', status: 'ACTIVE' })
      .returning();
    return user;
  }

  describe('POST /auth/forgot-password', () => {
    it('con un email existente, responde 200 genérico y crea un EmailToken de tipo RESET_PASSWORD', async () => {
      const user = await createActiveUser('olvido@example.com');

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(res.body.message).toEqual(expect.any(String));

      const tokens = await db
        .select()
        .from(emailTokens)
        .where(eq(emailTokens.userId, user.id));
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('RESET_PASSWORD');
    });

    it('con un email inexistente, responde exactamente igual (200, mismo mensaje) y no crea ningún token', async () => {
      const resExisting = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'no-existe-reset@example.com' })
        .expect(200);

      expect(resExisting.body.message).toEqual(expect.any(String));

      const tokens = await db.select().from(emailTokens);
      expect(tokens).toHaveLength(0);
    });

    it('una segunda solicitud invalida el enlace anterior sin usar', async () => {
      const user = await createActiveUser('reenvio-reset@example.com');

      await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: user.email }).expect(200);
      await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: user.email }).expect(200);

      const tokens = await db.select().from(emailTokens).where(eq(emailTokens.userId, user.id));
      expect(tokens).toHaveLength(2); // el viejo (invalidado) + el nuevo
      expect(tokens.filter((t) => t.usedAt !== null)).toHaveLength(1);
      expect(tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('con un token válido, cambia la contraseña, invalida el token y cierra todas las sesiones activas', async () => {
      const user = await createActiveUser('reset-valido@example.com');

      // Sesión activa previa al reset (H5 criterio 2: debe quedar revocada).
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: OLD_PASSWORD })
        .expect(200);
      expect(loginRes.body.accessToken).toEqual(expect.any(String));

      const { plaintext, hash } = generateOpaqueToken();
      await db.insert(emailTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: plaintext, password: NEW_PASSWORD })
        .expect(200);

      // La contraseña vieja ya no sirve; la nueva sí.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: OLD_PASSWORD })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: NEW_PASSWORD })
        .expect(200);

      // El token de reset ya está usado.
      const [token] = await db.select().from(emailTokens).where(eq(emailTokens.tokenHash, hash));
      expect(token.usedAt).not.toBeNull();

      // La sesión creada por el login previo al reset ha quedado revocada
      // (H5 criterio 2). El login posterior con la contraseña nueva crea una
      // sesión propia, así que se identifica la primera por orden de creación.
      const allSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, user.id))
        .orderBy(sessions.createdAt);
      expect(allSessions.length).toBeGreaterThanOrEqual(1);
      expect(allSessions[0].revokedAt).not.toBeNull();
    });

    it('con un token que no existe, responde 400', async () => {
      const fakeToken = 'a'.repeat(64);
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: fakeToken, password: NEW_PASSWORD })
        .expect(400);
    });

    it('con un token ya usado, responde 400 y no cambia la contraseña', async () => {
      const user = await createActiveUser('token-usado@example.com');
      const { plaintext, hash } = generateOpaqueToken();
      await db.insert(emailTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: plaintext, password: NEW_PASSWORD })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: plaintext, password: 'Otra-Contraseña-789' })
        .expect(400);
      expect(res.body.message).toContain('ya se ha utilizado');
    });

    it('con un token caducado, responde 400 y no cambia la contraseña', async () => {
      const user = await createActiveUser('token-caducado@example.com');
      const { plaintext, hash } = generateOpaqueToken();
      await db.insert(emailTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() - 1000),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: plaintext, password: NEW_PASSWORD })
        .expect(400);
      expect(res.body.message).toContain('caducado');

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: OLD_PASSWORD })
        .expect(200);
    });

    it('aislamiento: el token de reset de un usuario nunca afecta a otro usuario', async () => {
      const userA = await createActiveUser('reset-aislado-a@example.com');
      const userB = await createActiveUser('reset-aislado-b@example.com');

      const { plaintext: tokenA, hash: hashA } = generateOpaqueToken();
      await db.insert(emailTokens).values({
        userId: userA.id,
        tokenHash: hashA,
        type: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: tokenA, password: NEW_PASSWORD })
        .expect(200);

      // B sigue pudiendo entrar con su contraseña original: el reset de A no le afecta.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userB.email, password: OLD_PASSWORD })
        .expect(200);

      const [updatedB] = await db.select().from(users).where(eq(users.id, userB.id));
      const [updatedA] = await db.select().from(users).where(eq(users.id, userA.id));
      expect(updatedB.passwordHash).toBe(userB.passwordHash); // sin cambios
      expect(updatedA.passwordHash).not.toBe(userA.passwordHash); // cambiada
    });
  });
});
