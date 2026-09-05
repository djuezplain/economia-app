import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { cashBalances, cashHoldings, users } from '../src/db/schema/index.js';

describe('Historial de importes de efectivo (e2e) — spec 025 H2', () => {
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
    await db.delete(cashBalances);
    await db.delete(cashHoldings);
    await db.delete(users);
  });

  async function createUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    return user;
  }

  async function createHolding(userId: string, location: string) {
    const [holding] = await db.insert(cashHoldings).values({ userId, location }).returning();
    return holding;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /cash-balances', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/cash-balances').expect(401);
    });

    it('lista solo las entradas de ubicaciones propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerHolding = await createHolding(owner.id, 'Cartera');
      const otherHolding = await createHolding(other.id, 'Caja fuerte');
      await db.insert(cashBalances).values([
        { cashHoldingId: ownerHolding.id, amount: '100.00', date: '2026-08-01' },
        { cashHoldingId: ownerHolding.id, amount: '150.00', date: '2026-09-01' },
        { cashHoldingId: otherHolding.id, amount: '9999.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/cash-balances').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((b: { cashHoldingId: string }) => b.cashHoldingId === ownerHolding.id)).toBe(true);
    });
  });

  describe('POST /cash-balances', () => {
    it('crea una entrada en una ubicación propia', async () => {
      const user = await createUser('crear@example.com');
      const holding = await createHolding(user.id, 'Cartera');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/cash-balances')
        .set('Authorization', auth(token))
        .send({ cashHoldingId: holding.id, amount: '150.50', date: '2026-09-04' })
        .expect(201);

      expect(res.body.cashHoldingId).toBe(holding.id);
      expect(res.body.amount).toBe('150.50');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('H2 criterio 3: admite varias entradas en la misma ubicación, en fechas distintas', async () => {
      const user = await createUser('varias-entradas@example.com');
      const holding = await createHolding(user.id, 'Cartera');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/cash-balances')
        .set('Authorization', auth(token))
        .send({ cashHoldingId: holding.id, amount: '100.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/cash-balances')
        .set('Authorization', auth(token))
        .send({ cashHoldingId: holding.id, amount: '150.00', date: '2026-09-01' })
        .expect(201);

      const balances = await db.query.cashBalances.findMany({ where: (b, { eq }) => eq(b.cashHoldingId, holding.id) });
      expect(balances).toHaveLength(2);
    });

    it('H2 criterio 2: importe negativo → 400 (a diferencia del saldo de una cuenta bancaria)', async () => {
      const user = await createUser('importe-negativo@example.com');
      const holding = await createHolding(user.id, 'Cartera');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/cash-balances')
        .set('Authorization', auth(token))
        .send({ cashHoldingId: holding.id, amount: '-50.00', date: '2026-09-04' })
        .expect(400);
    });

    it('H2 criterio 6: crear una entrada sobre una ubicación ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerHolding = await createHolding(owner.id, 'Cartera');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/cash-balances')
        .set('Authorization', auth(token))
        .send({ cashHoldingId: ownerHolding.id, amount: '100.00', date: '2026-09-04' })
        .expect(404);
    });

    it('importe no numérico → 400', async () => {
      const user = await createUser('importe-invalido@example.com');
      const holding = await createHolding(user.id, 'Cartera');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/cash-balances')
        .set('Authorization', auth(token))
        .send({ cashHoldingId: holding.id, amount: 'abc', date: '2026-09-04' })
        .expect(400);
    });
  });

  describe('PATCH /cash-balances/:id', () => {
    it('edita importe y fecha', async () => {
      const user = await createUser('editar@example.com');
      const holding = await createHolding(user.id, 'Cartera');
      const token = await login(user.email);
      const [balance] = await db.insert(cashBalances).values({ cashHoldingId: holding.id, amount: '100.00', date: '2026-09-01' }).returning();

      const res = await request(app.getHttpServer())
        .patch(`/cash-balances/${balance.id}`)
        .set('Authorization', auth(token))
        .send({ amount: '200.00', date: '2026-09-10' })
        .expect(200);

      expect(res.body.amount).toBe('200.00');
      expect(res.body.date).toBe('2026-09-10');
    });

    it('una entrada de una ubicación ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const holding = await createHolding(owner.id, 'Cartera');
      const [balance] = await db.insert(cashBalances).values({ cashHoldingId: holding.id, amount: '100.00', date: '2026-09-01' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/cash-balances/${balance.id}`)
        .set('Authorization', auth(token))
        .send({ amount: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /cash-balances/:id', () => {
    it('elimina una entrada, sin afectar a la ubicación ni a las demás entradas', async () => {
      const user = await createUser('eliminar@example.com');
      const holding = await createHolding(user.id, 'Cartera');
      const token = await login(user.email);
      const [balanceA] = await db
        .insert(cashBalances)
        .values({ cashHoldingId: holding.id, amount: '100.00', date: '2026-08-01' })
        .returning();
      await db.insert(cashBalances).values({ cashHoldingId: holding.id, amount: '150.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/cash-balances/${balanceA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingBalances = await db.query.cashBalances.findMany({ where: (b, { eq }) => eq(b.cashHoldingId, holding.id) });
      expect(remainingBalances).toHaveLength(1);
      const stillThereHolding = await db.query.cashHoldings.findFirst({ where: (h, { eq }) => eq(h.id, holding.id) });
      expect(stillThereHolding).toBeDefined();
    });

    it('una entrada de una ubicación ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const holding = await createHolding(owner.id, 'Cartera');
      const [balance] = await db.insert(cashBalances).values({ cashHoldingId: holding.id, amount: '100.00', date: '2026-09-01' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/cash-balances/${balance.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.cashBalances.findFirst({ where: (b, { eq }) => eq(b.id, balance.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
