import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { fundPurchases, fundValuations, funds, users } from '../src/db/schema/index.js';

describe('Historial de compras de fondos (e2e) — spec 021 H2', () => {
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
    await db.delete(fundValuations);
    await db.delete(fundPurchases);
    await db.delete(funds);
    await db.delete(users);
  });

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function createFund(userId: string, custodyBank: string, fund: string) {
    const [entity] = await db.insert(funds).values({ userId, custodyBank, fund }).returning();
    return entity;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /fund-purchases', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/fund-purchases').expect(401);
    });

    it('lista solo las compras de fondos propios, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerFund = await createFund(owner.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const otherFund = await createFund(other.id, 'DeGiro', 'MSCI World');
      await db.insert(fundPurchases).values([
        { fundId: ownerFund.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' },
        { fundId: ownerFund.id, shareCount: '5.0000', purchasePrice: '32.00', date: '2026-09-01' },
        { fundId: otherFund.id, shareCount: '5.0000', purchasePrice: '150.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/fund-purchases').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((p: { fundId: string }) => p.fundId === ownerFund.id)).toBe(true);
    });
  });

  describe('POST /fund-purchases', () => {
    it('crea una compra en un fondo propio', async () => {
      const user = await createUser('crear@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '10', purchasePrice: '28.50', date: '2026-09-04' })
        .expect(201);

      expect(res.body.fundId).toBe(fund.id);
      expect(res.body.shareCount).toBe('10.00000000');
      expect(res.body.purchasePrice).toBe('28.50000000');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('admite un número de participaciones fraccionario', async () => {
      const user = await createUser('fraccional@example.com');
      const fund = await createFund(user.id, 'DeGiro', 'MSCI World');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '0.5', purchasePrice: '150.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.shareCount).toBe('0.50000000');
    });

    it('número de participaciones y precio de compra admiten hasta 8 decimales', async () => {
      const user = await createUser('ocho-decimales@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Fondo indexado fraccionario');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '0.12345678', purchasePrice: '28123.87654321', date: '2026-09-04' })
        .expect(201);

      expect(res.body.shareCount).toBe('0.12345678');
      expect(res.body.purchasePrice).toBe('28123.87654321');
    });

    it('más de 8 decimales en el número de participaciones → 400', async () => {
      const user = await createUser('nueve-decimales-participaciones@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '0.123456789', purchasePrice: '28.50', date: '2026-09-04' })
        .expect(400);
    });

    it('más de 8 decimales en el precio de compra → 400', async () => {
      const user = await createUser('nueve-decimales-precio@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '10', purchasePrice: '28.123456789', date: '2026-09-04' })
        .expect(400);
    });

    it('admite varias compras en el mismo fondo, en fechas distintas', async () => {
      const user = await createUser('varias-compras@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '5', purchasePrice: '28.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '5', purchasePrice: '32.00', date: '2026-09-01' })
        .expect(201);

      const purchases = await db.query.fundPurchases.findMany({ where: (p, { eq }) => eq(p.fundId, fund.id) });
      expect(purchases).toHaveLength(2);
    });

    it('crear una compra sobre un fondo ajeno → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerFund = await createFund(owner.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: ownerFund.id, shareCount: '5', purchasePrice: '28.00', date: '2026-09-04' })
        .expect(404);
    });

    it('número de participaciones negativo o cero → 400', async () => {
      const user = await createUser('participaciones-invalidas@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '-5', purchasePrice: '28.00', date: '2026-09-04' })
        .expect(400);
    });

    it('sin fecha → 400', async () => {
      const user = await createUser('sin-fecha@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/fund-purchases')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, shareCount: '5', purchasePrice: '28.00' })
        .expect(400);
    });
  });

  describe('PATCH /fund-purchases/:id', () => {
    it('edita número de participaciones, precio de compra y fecha', async () => {
      const user = await createUser('editar@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);
      const [purchase] = await db
        .insert(fundPurchases)
        .values({ fundId: fund.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/fund-purchases/${purchase.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '12', purchasePrice: '29.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.shareCount).toBe('12.00000000');
      expect(res.body.purchasePrice).toBe('29.00000000');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('una compra de un fondo ajeno → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const fund = await createFund(owner.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const [purchase] = await db
        .insert(fundPurchases)
        .values({ fundId: fund.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/fund-purchases/${purchase.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '999' })
        .expect(404);
    });
  });

  describe('DELETE /fund-purchases/:id', () => {
    it('elimina una compra, sin afectar al fondo ni a las demás compras', async () => {
      const user = await createUser('eliminar@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);
      const [purchaseA] = await db
        .insert(fundPurchases)
        .values({ fundId: fund.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      await db.insert(fundPurchases).values({ fundId: fund.id, shareCount: '5.0000', purchasePrice: '30.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/fund-purchases/${purchaseA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingPurchases = await db.query.fundPurchases.findMany({ where: (p, { eq }) => eq(p.fundId, fund.id) });
      expect(remainingPurchases).toHaveLength(1);
      const stillThereFund = await db.query.funds.findFirst({ where: (f, { eq }) => eq(f.id, fund.id) });
      expect(stillThereFund).toBeDefined();
    });

    it('una compra de un fondo ajeno → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const fund = await createFund(owner.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const [purchase] = await db
        .insert(fundPurchases)
        .values({ fundId: fund.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/fund-purchases/${purchase.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.fundPurchases.findFirst({ where: (p, { eq }) => eq(p.id, purchase.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
