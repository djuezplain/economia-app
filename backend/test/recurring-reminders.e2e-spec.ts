import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { categories, recurringTransactions, transactions, users } from '../src/db/schema/index.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';

describe('Avisos de recibos recurrentes (e2e) — spec 049 H1', () => {
  let app: INestApplication<App>;
  let db: Database;
  let rateLimitGuard: RateLimitGuard;
  let moduleFixture: TestingModule;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = moduleFixture.get<Database>(DB);
    rateLimitGuard = moduleFixture.get<RateLimitGuard>(RateLimitGuard);
  });

  afterAll(async () => {
    await db.delete(recurringTransactions);
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(recurringTransactions);
    await db.delete(transactions);
    await db.delete(categories);
    await db.delete(users);
    rateLimitGuard.resetForTests();
  });

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken as string}`;
  }

  async function setupUser(email = 'ana@example.com') {
    const user = await createUser(email);
    const [category] = await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Seguros' }).returning();
    const token = await login(email);
    return { user, category, token };
  }

  function createTemplate(token: string, categoryId: string, extra: object = {}) {
    return request(app.getHttpServer())
      .post('/recurring-transactions')
      .set('Authorization', token)
      .send({ type: 'EXPENSE', categoryId, concept: 'Seguro hogar', amount: '30.00', frequency: 'MONTHLY', startDate: '2026-01-05', ...extra });
  }

  describe('configuración (T5.1)', () => {
    it('por defecto, una plantilla nueva no avisa y tiene 2 días de antelación', async () => {
      const { token, category } = await setupUser();
      const res = await createTemplate(token, category.id).expect(201);
      expect(res.body).toMatchObject({ reminderEnabled: false, reminderDaysBefore: 2 });
    });

    it('guarda y edita el aviso y sus días de antelación', async () => {
      const { token, category } = await setupUser();
      const created = await createTemplate(token, category.id, { reminderEnabled: true, reminderDaysBefore: 0 }).expect(201);
      expect(created.body).toMatchObject({ reminderEnabled: true, reminderDaysBefore: 0 });

      const updated = await request(app.getHttpServer())
        .patch(`/recurring-transactions/${created.body.id as string}`)
        .set('Authorization', token)
        .send({ reminderDaysBefore: 7 })
        .expect(200);
      expect(updated.body).toMatchObject({ reminderEnabled: true, reminderDaysBefore: 7 });
    });

    it('rechaza días de antelación fuera de 0..7 o no enteros', async () => {
      const { token, category } = await setupUser();
      await createTemplate(token, category.id, { reminderDaysBefore: 8 }).expect(400);
      await createTemplate(token, category.id, { reminderDaysBefore: -1 }).expect(400);
      await createTemplate(token, category.id, { reminderDaysBefore: 1.5 }).expect(400);
      await createTemplate(token, category.id, { reminderEnabled: 'sí' }).expect(400);
    });

    it('el perfil expone el interruptor global (activado por defecto) y se puede cambiar', async () => {
      const { token } = await setupUser();
      const me = await request(app.getHttpServer()).get('/users/me').set('Authorization', token).expect(200);
      expect(me.body.recurringReminderEmails).toBe(true);

      const patched = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', token)
        .send({ recurringReminderEmails: false })
        .expect(200);
      expect(patched.body.recurringReminderEmails).toBe(false);
      const again = await request(app.getHttpServer()).get('/users/me').set('Authorization', token).expect(200);
      expect(again.body.recurringReminderEmails).toBe(false);

      await request(app.getHttpServer()).patch('/users/me').set('Authorization', token).send({ recurringReminderEmails: 'no' }).expect(400);
    });
  });
});
