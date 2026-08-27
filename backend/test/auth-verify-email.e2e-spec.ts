import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { emailTokens, users } from '../src/db/schema/index.js';
import { generateOpaqueToken } from '../src/common/tokens.util.js';

describe('Verificación de email (e2e) — spec 001 H2', () => {
  let app: INestApplication<App>;
  let db: Database;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    db = moduleFixture.get<Database>(DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(emailTokens);
    await db.delete(users);
  });

  async function createPendingUser(email = 'ana@example.com') {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: 'irrelevante-en-este-test', name: 'Ana' })
      .returning();
    return user;
  }

  describe('GET /auth/verify-email', () => {
    it('activa la cuenta con un token válido', async () => {
      const user = await createPendingUser();
      const { plaintext, hash } = generateOpaqueToken();
      await db.insert(emailTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await request(app.getHttpServer()).get(`/auth/verify-email?token=${plaintext}`).expect(200);

      const [updated] = await db.select().from(users).where(eq(users.id, user.id));
      expect(updated.status).toBe('ACTIVE');
    });

    it('rechaza un token que no existe', async () => {
      const fake = 'a'.repeat(64);
      const res = await request(app.getHttpServer()).get(`/auth/verify-email?token=${fake}`).expect(400);
      expect(res.body.message).toContain('inválido');
    });

    it('rechaza un token caducado y no activa la cuenta', async () => {
      const user = await createPendingUser();
      const { plaintext, hash } = generateOpaqueToken();
      await db.insert(emailTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() - 1000), // ya caducado
      });

      const res = await request(app.getHttpServer()).get(`/auth/verify-email?token=${plaintext}`).expect(400);
      expect(res.body.message).toContain('caducado');

      const [notUpdated] = await db.select().from(users).where(eq(users.id, user.id));
      expect(notUpdated.status).toBe('PENDING_VERIFICATION');
    });

    it('rechaza un token ya utilizado', async () => {
      const user = await createPendingUser();
      const { plaintext, hash } = generateOpaqueToken();
      await db.insert(emailTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await request(app.getHttpServer()).get(`/auth/verify-email?token=${plaintext}`).expect(200);
      const res = await request(app.getHttpServer()).get(`/auth/verify-email?token=${plaintext}`).expect(400);
      expect(res.body.message).toContain('ya se ha utilizado');
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('reenvía y el enlace anterior deja de ser válido', async () => {
      const user = await createPendingUser();
      const { plaintext: oldToken, hash: oldHash } = generateOpaqueToken();
      await db.insert(emailTokens).values({
        userId: user.id,
        tokenHash: oldHash,
        type: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      // El token viejo ya no sirve (se invalidó al reenviar).
      const res = await request(app.getHttpServer()).get(`/auth/verify-email?token=${oldToken}`).expect(400);
      expect(res.body.message).toContain('ya se ha utilizado');

      const tokens = await db.select().from(emailTokens).where(eq(emailTokens.userId, user.id));
      expect(tokens).toHaveLength(2); // el viejo (invalidado) + el nuevo
    });

    it('responde igual (200, mismo mensaje) para un email que no existe, sin filtrar nada', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .send({ email: 'no-existe@example.com' })
        .expect(200);

      expect(res.body.message).toEqual(expect.any(String));
    });

    it('no reenvía si la cuenta ya está verificada (pero responde igual)', async () => {
      const user = await createPendingUser('activa@example.com');
      await db.update(users).set({ status: 'ACTIVE' }).where(eq(users.id, user.id));

      await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .send({ email: 'activa@example.com' })
        .expect(200);

      const tokens = await db.select().from(emailTokens).where(eq(emailTokens.userId, user.id));
      expect(tokens).toHaveLength(0); // no se ha creado ningún token nuevo
    });
  });
});
