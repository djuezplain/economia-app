import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { categories, recurringTransactions, transactions, users } from '../src/db/schema/index.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';

describe('Movimientos recurrentes (e2e) — spec 047', () => {
  let app: INestApplication<App>;
  let db: Database;
  let rateLimitGuard: RateLimitGuard;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = moduleFixture.get<Database>(DB);
    rateLimitGuard = moduleFixture.get<RateLimitGuard>(RateLimitGuard);
  });

  afterAll(async () => {
    // Las demás suites borran `categories` sin saber de plantillas (FK restrict).
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

  async function createCategory(userId: string, type: 'INCOME' | 'EXPENSE', name: string) {
    const [category] = await db.insert(categories).values({ userId, type, name }).returning();
    return category;
  }

  /** Usuario con sesión, una categoría de gasto y una plantilla mensual de 600 € el día 5 desde enero de 2026. */
  async function setup(email = 'ana@example.com') {
    const user = await createUser(email);
    const category = await createCategory(user.id, 'EXPENSE', 'Vivienda');
    const token = await login(user.email);
    const res = await request(app.getHttpServer())
      .post('/recurring-transactions')
      .set('Authorization', token)
      .send({
        type: 'EXPENSE',
        categoryId: category.id,
        concept: 'Alquiler',
        amount: '600.00',
        frequency: 'MONTHLY',
        startDate: '2026-01-05',
      })
      .expect(201);
    return { user, category, token, template: res.body as { id: string } };
  }

  const confirm = (token: string, id: string, date: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(`/recurring-transactions/${id}/occurrences/${date}/confirm`)
      .set('Authorization', token)
      .send(body);
  const skip = (token: string, id: string, date: string) =>
    request(app.getHttpServer()).post(`/recurring-transactions/${id}/occurrences/${date}/skip`).set('Authorization', token);

  describe('plantillas (CRUD)', () => {
    it('sin autenticar responde 401; con cuenta sin verificar, 403', async () => {
      await request(app.getHttpServer()).get('/recurring-transactions').expect(401);
      const user = await createUser('pendiente@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/recurring-transactions').set('Authorization', token).expect(403);
    });

    it('crea, lista, edita y borra una plantilla', async () => {
      const { token, template } = await setup();
      const list = await request(app.getHttpServer()).get('/recurring-transactions').set('Authorization', token).expect(200);
      expect(list.body).toHaveLength(1);

      const updated = await request(app.getHttpServer())
        .patch(`/recurring-transactions/${template.id}`)
        .set('Authorization', token)
        .send({ amount: '650.00', active: false })
        .expect(200);
      expect(updated.body).toMatchObject({ amount: '650.00', active: false });

      await request(app.getHttpServer()).delete(`/recurring-transactions/${template.id}`).set('Authorization', token).expect(204);
      const after = await request(app.getHttpServer()).get('/recurring-transactions').set('Authorization', token).expect(200);
      expect(after.body).toEqual([]);
    });

    it('rechaza datos inválidos: subcategoría en un ingreso, fin anterior al inicio, categoría de otro tipo', async () => {
      const { user, category, token } = await setup();
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const base = { concept: 'X', amount: '10.00', frequency: 'MONTHLY', startDate: '2026-03-01' };
      const post = (body: object) =>
        request(app.getHttpServer()).post('/recurring-transactions').set('Authorization', token).send({ ...base, ...body });

      await post({ type: 'INCOME', categoryId: income.id, merchant: 'Empresa' }).expect(400);
      await post({ type: 'EXPENSE', categoryId: category.id, endDate: '2026-02-01' }).expect(400);
      await post({ type: 'EXPENSE', categoryId: income.id }).expect(400);
      await post({ type: 'EXPENSE', categoryId: category.id, frequency: 'DAILY' }).expect(400);
    });

    it('aislamiento: otro usuario no ve, edita, borra ni confirma plantillas ajenas', async () => {
      const { template } = await setup('ana@example.com');
      const other = await createUser('luis@example.com');
      const otherToken = await login(other.email);

      const list = await request(app.getHttpServer()).get('/recurring-transactions').set('Authorization', otherToken).expect(200);
      expect(list.body).toEqual([]);
      await request(app.getHttpServer())
        .patch(`/recurring-transactions/${template.id}`)
        .set('Authorization', otherToken)
        .send({ amount: '1.00' })
        .expect(404);
      await request(app.getHttpServer()).delete(`/recurring-transactions/${template.id}`).set('Authorization', otherToken).expect(404);
      await confirm(otherToken, template.id, '2026-03-05').expect(404);
      await skip(otherToken, template.id, '2026-03-05').expect(404);
      expect(await db.select().from(transactions)).toHaveLength(0);

      const occ = await request(app.getHttpServer())
        .get('/recurring-transactions/occurrences?from=2026-03-01&to=2026-03-31')
        .set('Authorization', otherToken)
        .expect(200);
      expect(occ.body).toEqual([]);
    });
  });

  describe('GET /recurring-transactions/occurrences', () => {
    it('calcula las ocurrencias del rango con su estado; las pausadas no salen', async () => {
      const { token, template } = await setup();
      const get = () =>
        request(app.getHttpServer())
          .get('/recurring-transactions/occurrences?from=2026-01-01&to=2026-03-31')
          .set('Authorization', token)
          .expect(200);

      await confirm(token, template.id, '2026-01-05').expect(200);
      await skip(token, template.id, '2026-02-05').expect(204);

      const res = await get();
      expect(res.body.map((o: { date: string; status: string }) => [o.date, o.status])).toEqual([
        ['2026-01-05', 'CONFIRMED'],
        ['2026-02-05', 'SKIPPED'],
        ['2026-03-05', 'OVERDUE'], // fecha pasada sin resolver (hoy es posterior a 2026-03-05)
      ]);
      expect(res.body[0].transactionId).toEqual(expect.any(String));

      await request(app.getHttpServer())
        .patch(`/recurring-transactions/${template.id}`)
        .set('Authorization', token)
        .send({ active: false })
        .expect(200);
      expect((await get()).body).toEqual([]);
    });

    it('una ocurrencia futura está PENDING', async () => {
      const { token } = await setup();
      const res = await request(app.getHttpServer())
        .get('/recurring-transactions/occurrences?from=2999-01-01&to=2999-01-31')
        .set('Authorization', token)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ date: '2999-01-05', status: 'PENDING' });
    });

    it('rechaza rangos invertidos o superiores a 366 días', async () => {
      const { token } = await setup();
      const get = (q: string) => request(app.getHttpServer()).get(`/recurring-transactions/occurrences?${q}`).set('Authorization', token);
      await get('from=2026-03-01&to=2026-02-01').expect(400);
      await get('from=2026-01-01&to=2027-06-01').expect(400);
      await get('from=2026-01-01').expect(400);
      await get('from=2026-01-01&to=2026-12-31').expect(200); // 365 días
    });
  });

  describe('confirmar / omitir', () => {
    it('confirmar crea el movimiento real con los datos de la plantilla', async () => {
      const { user, category, token, template } = await setup();
      const res = await confirm(token, template.id, '2026-03-05').expect(200);
      expect(res.body).toMatchObject({
        userId: user.id,
        type: 'EXPENSE',
        date: '2026-03-05',
        categoryId: category.id,
        concept: 'Alquiler',
        amount: '600.00',
      });
      expect(await db.select().from(transactions)).toHaveLength(1);
    });

    it('permite ajustar el importe al confirmar', async () => {
      const { token, template } = await setup();
      const res = await confirm(token, template.id, '2026-03-05', { amount: '612.34' }).expect(200);
      expect(res.body.amount).toBe('612.34');
    });

    it('es idempotente: confirmar dos veces (también en paralelo) no duplica el movimiento', async () => {
      const { token, template } = await setup();
      const [a, b] = await Promise.all([confirm(token, template.id, '2026-03-05'), confirm(token, template.id, '2026-03-05')]);
      const again = await confirm(token, template.id, '2026-03-05');
      expect([a.status, b.status, again.status]).toEqual([200, 200, 200]);
      expect(a.body.id).toBe(b.body.id);
      expect(again.body.id).toBe(a.body.id);
      expect(await db.select().from(transactions)).toHaveLength(1);
    });

    it('rechaza fechas que no son ocurrencia de la plantilla', async () => {
      const { token, template } = await setup();
      await confirm(token, template.id, '2026-03-06').expect(400); // día distinto
      await confirm(token, template.id, '2025-12-05').expect(400); // antes del inicio
      await confirm(token, template.id, 'no-es-fecha').expect(400);
      await skip(token, template.id, '2026-03-06').expect(400);
    });

    it('omitir no crea movimiento, es repetible y no se puede confirmar después (409); y al revés', async () => {
      const { token, template } = await setup();
      await skip(token, template.id, '2026-03-05').expect(204);
      await skip(token, template.id, '2026-03-05').expect(204);
      expect(await db.select().from(transactions)).toHaveLength(0);
      await confirm(token, template.id, '2026-03-05').expect(409);

      await confirm(token, template.id, '2026-04-05').expect(200);
      await skip(token, template.id, '2026-04-05').expect(409);
    });

    it('editar la plantilla no cambia los movimientos ya confirmados; borrarla tampoco', async () => {
      const { token, template } = await setup();
      const confirmed = await confirm(token, template.id, '2026-03-05').expect(200);

      await request(app.getHttpServer())
        .patch(`/recurring-transactions/${template.id}`)
        .set('Authorization', token)
        .send({ amount: '999.00', concept: 'Alquiler nuevo' })
        .expect(200);
      let [tx] = await db.select().from(transactions).where(eq(transactions.id, confirmed.body.id));
      expect(tx).toMatchObject({ amount: '600.00', concept: 'Alquiler' });

      // Las siguientes ocurrencias sí usan los datos nuevos.
      const next = await confirm(token, template.id, '2026-04-05').expect(200);
      expect(next.body).toMatchObject({ amount: '999.00', concept: 'Alquiler nuevo' });

      await request(app.getHttpServer()).delete(`/recurring-transactions/${template.id}`).set('Authorization', token).expect(204);
      [tx] = await db.select().from(transactions).where(eq(transactions.id, confirmed.body.id));
      expect(tx).toBeDefined();
      expect(await db.select().from(transactions)).toHaveLength(2);
    });

    it('si se borra el movimiento confirmado, la ocurrencia no vuelve a salir como pendiente', async () => {
      const { token, template } = await setup();
      const confirmed = await confirm(token, template.id, '2026-03-05').expect(200);
      await request(app.getHttpServer()).delete(`/transactions/${confirmed.body.id}`).set('Authorization', token).expect(204);

      const res = await request(app.getHttpServer())
        .get('/recurring-transactions/occurrences?from=2026-03-01&to=2026-03-31')
        .set('Authorization', token)
        .expect(200);
      expect(res.body[0]).toMatchObject({ date: '2026-03-05', status: 'CONFIRMED', transactionId: null });
    });
  });
});
