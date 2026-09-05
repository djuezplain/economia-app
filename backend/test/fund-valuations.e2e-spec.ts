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

describe('Historial de valoraciones de fondos (e2e) — spec 021 H3', () => {
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

  describe('GET /fund-valuations', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/fund-valuations').expect(401);
    });

    it('lista solo las valoraciones de fondos propios, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerFund = await createFund(owner.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const otherFund = await createFund(other.id, 'DeGiro', 'MSCI World');
      await db.insert(fundValuations).values([
        { fundId: ownerFund.id, pricePerShare: '32.00', date: '2026-08-01' },
        { fundId: ownerFund.id, pricePerShare: '35.00', date: '2026-09-01' },
        { fundId: otherFund.id, pricePerShare: '99.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/fund-valuations').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((v: { fundId: string }) => v.fundId === ownerFund.id)).toBe(true);
    });
  });

  describe('POST /fund-valuations', () => {
    it('crea una valoración en un fondo propio', async () => {
      const user = await createUser('crear@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/fund-valuations')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, pricePerShare: '35.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.fundId).toBe(fund.id);
      expect(res.body.pricePerShare).toBe('35.00000000');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('admite hasta 8 decimales (a diferencia de las valoraciones de acciones, que se quedan en 2)', async () => {
      const user = await createUser('ocho-decimales@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Fondo indexado fraccionario');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/fund-valuations')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, pricePerShare: '28123.87654321', date: '2026-09-04' })
        .expect(201);

      expect(res.body.pricePerShare).toBe('28123.87654321');
    });

    it('más de 8 decimales → 400', async () => {
      const user = await createUser('nueve-decimales@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/fund-valuations')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, pricePerShare: '35.123456789', date: '2026-09-04' })
        .expect(400);
    });

    it('admite varias valoraciones en fechas distintas', async () => {
      const user = await createUser('varias-valoraciones@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/fund-valuations')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, pricePerShare: '32.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/fund-valuations')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, pricePerShare: '35.00', date: '2026-09-01' })
        .expect(201);

      const valuations = await db.query.fundValuations.findMany({ where: (v, { eq }) => eq(v.fundId, fund.id) });
      expect(valuations).toHaveLength(2);
    });

    it('valoración negativa → 400 (a diferencia del saldo bancario, no puede ser negativa)', async () => {
      const user = await createUser('valoracion-invalida@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/fund-valuations')
        .set('Authorization', auth(token))
        .send({ fundId: fund.id, pricePerShare: '-5.00', date: '2026-09-04' })
        .expect(400);
    });

    it('crear una valoración sobre un fondo ajeno → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerFund = await createFund(owner.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/fund-valuations')
        .set('Authorization', auth(token))
        .send({ fundId: ownerFund.id, pricePerShare: '35.00', date: '2026-09-04' })
        .expect(404);
    });
  });

  describe('PATCH /fund-valuations/:id', () => {
    it('edita valoración y fecha', async () => {
      const user = await createUser('editar@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);
      const [valuation] = await db
        .insert(fundValuations)
        .values({ fundId: fund.id, pricePerShare: '32.00', date: '2026-08-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/fund-valuations/${valuation.id}`)
        .set('Authorization', auth(token))
        .send({ pricePerShare: '35.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.pricePerShare).toBe('35.00000000');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('una valoración de un fondo ajeno → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const fund = await createFund(owner.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const [valuation] = await db
        .insert(fundValuations)
        .values({ fundId: fund.id, pricePerShare: '32.00', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/fund-valuations/${valuation.id}`)
        .set('Authorization', auth(token))
        .send({ pricePerShare: '99.00' })
        .expect(404);
    });
  });

  describe('DELETE /fund-valuations/:id', () => {
    it('elimina una valoración, sin afectar al fondo ni a las demás valoraciones', async () => {
      const user = await createUser('eliminar@example.com');
      const fund = await createFund(user.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const token = await login(user.email);
      const [valuationA] = await db
        .insert(fundValuations)
        .values({ fundId: fund.id, pricePerShare: '32.00', date: '2026-08-01' })
        .returning();
      await db.insert(fundValuations).values({ fundId: fund.id, pricePerShare: '35.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/fund-valuations/${valuationA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingValuations = await db.query.fundValuations.findMany({ where: (v, { eq }) => eq(v.fundId, fund.id) });
      expect(remainingValuations).toHaveLength(1);
      const stillThereFund = await db.query.funds.findFirst({ where: (f, { eq }) => eq(f.id, fund.id) });
      expect(stillThereFund).toBeDefined();
    });

    it('una valoración de un fondo ajeno → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const fund = await createFund(owner.id, 'MyInvestor', 'Vanguard Global Stock Index');
      const [valuation] = await db
        .insert(fundValuations)
        .values({ fundId: fund.id, pricePerShare: '32.00', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/fund-valuations/${valuation.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.fundValuations.findFirst({ where: (v, { eq }) => eq(v.id, valuation.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
