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

interface OccurrenceBody {
  recurringId: string;
  date: string;
  status: string;
  amount: string;
  estimated: boolean;
}

describe('Recurrentes con importe variable (e2e) — spec 049 H2', () => {
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

  async function createUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken as string}`;
  }

  /** Recibo de luz mensual, día 10 desde enero de 2026, importe inicial 50 €. */
  async function setup(email = 'ana@example.com', variableAmount = true) {
    const user = await createUser(email);
    const [category] = await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Suministros' }).returning();
    const token = await login(user.email);
    const res = await request(app.getHttpServer())
      .post('/recurring-transactions')
      .set('Authorization', token)
      .send({
        type: 'EXPENSE',
        categoryId: category.id,
        concept: 'Luz',
        amount: '50.00',
        frequency: 'MONTHLY',
        startDate: '2026-01-10',
        variableAmount,
      })
      .expect(201);
    return { user, category, token, template: res.body as { id: string; variableAmount: boolean } };
  }

  function confirm(token: string, id: string, date: string, amount?: string) {
    return request(app.getHttpServer())
      .post(`/recurring-transactions/${id}/occurrences/${date}/confirm`)
      .set('Authorization', token)
      .send(amount === undefined ? {} : { amount });
  }

  async function occurrence(token: string, date: string): Promise<OccurrenceBody> {
    const res = await request(app.getHttpServer())
      .get(`/recurring-transactions/occurrences?from=${date}&to=${date}`)
      .set('Authorization', token)
      .expect(200);
    return (res.body as OccurrenceBody[])[0];
  }

  it('guarda y edita la marca de importe variable', async () => {
    const { token, template } = await setup();
    expect(template.variableAmount).toBe(true);

    const res = await request(app.getHttpServer())
      .patch(`/recurring-transactions/${template.id}`)
      .set('Authorization', token)
      .send({ variableAmount: false })
      .expect(200);
    expect(res.body.variableAmount).toBe(false);
  });

  it('sin ocurrencias resueltas, la prevista usa el importe inicial marcado como estimado', async () => {
    const { token } = await setup();
    expect(await occurrence(token, '2026-03-10')).toMatchObject({ amount: '50.00', estimated: true, status: 'OVERDUE' });
  });

  it('la estimación es la media de las resueltas (con 2, de las 2; con 4, de las 3 más recientes)', async () => {
    const { token, template } = await setup();
    await confirm(token, template.id, '2026-01-10', '40.00').expect(200);
    await confirm(token, template.id, '2026-02-10', '60.00').expect(200);
    expect((await occurrence(token, '2026-05-10')).amount).toBe('50.00');

    await confirm(token, template.id, '2026-03-10', '80.00').expect(200);
    await confirm(token, template.id, '2026-04-10', '100.00').expect(200);
    // Las 3 más recientes por fecha de ocurrencia: 100, 80, 60 → 80.
    expect((await occurrence(token, '2026-05-10')).amount).toBe('80.00');
  });

  it('una omitida no cuenta para la estimación', async () => {
    const { token, template } = await setup();
    await confirm(token, template.id, '2026-01-10', '70.00').expect(200);
    await request(app.getHttpServer())
      .post(`/recurring-transactions/${template.id}/occurrences/2026-02-10/skip`)
      .set('Authorization', token)
      .expect(204);
    expect((await occurrence(token, '2026-03-10')).amount).toBe('70.00');
  });

  it('si se corrige el importe de un movimiento confirmado, la estimación lo recoge', async () => {
    const { token, template } = await setup();
    const confirmed = await confirm(token, template.id, '2026-01-10', '70.00').expect(200);
    await request(app.getHttpServer())
      .patch(`/transactions/${confirmed.body.id as string}`)
      .set('Authorization', token)
      .send({ amount: '90.00' })
      .expect(200);
    expect((await occurrence(token, '2026-02-10')).amount).toBe('90.00');
  });

  it('una resuelta no es estimada: devuelve el importe de la plantilla', async () => {
    const { token, template } = await setup();
    await confirm(token, template.id, '2026-01-10', '70.00').expect(200);
    expect(await occurrence(token, '2026-01-10')).toMatchObject({ status: 'CONFIRMED', estimated: false, amount: '50.00' });
  });

  it('confirmar una variable sin importe → 400 y no crea nada; con importe, lo usa', async () => {
    const { token, template, user } = await setup();
    await confirm(token, template.id, '2026-01-10').expect(400);
    expect(await db.query.transactions.findMany({ where: (t, { eq }) => eq(t.userId, user.id) })).toHaveLength(0);

    const res = await confirm(token, template.id, '2026-01-10', '63.45').expect(200);
    expect(res.body.amount).toBe('63.45');
  });

  it('una plantilla fija sigue como en la spec 047: sin importe, usa el de la plantilla y no es estimada', async () => {
    const { token, template } = await setup('ana@example.com', false);
    expect(await occurrence(token, '2026-03-10')).toMatchObject({ amount: '50.00', estimated: false });
    const res = await confirm(token, template.id, '2026-03-10').expect(200);
    expect(res.body.amount).toBe('50.00');
  });

  it('aislamiento: la estimación solo usa movimientos propios y otro usuario no confirma la plantilla', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    await confirm(bea.token, bea.template.id, '2026-01-10', '500.00').expect(200);

    expect((await occurrence(ana.token, '2026-02-10')).amount).toBe('50.00');
    await confirm(bea.token, ana.template.id, '2026-02-10', '10.00').expect(404);
  });
});
