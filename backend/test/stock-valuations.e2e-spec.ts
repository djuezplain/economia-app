import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { stockPurchases, stockValuations, stocks, users } from '../src/db/schema/index.js';

describe('Historial de valoraciones de acciones (e2e) — spec 020 H3', () => {
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
    await db.delete(stockValuations);
    await db.delete(stockPurchases);
    await db.delete(stocks);
    await db.delete(users);
  });

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function createStock(userId: string, custodyBank: string, stock: string) {
    const [entity] = await db.insert(stocks).values({ userId, custodyBank, stock }).returning();
    return entity;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /stock-valuations', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/stock-valuations').expect(401);
    });

    it('lista solo las valoraciones de acciones propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerStock = await createStock(owner.id, 'BBVA', 'Inditex');
      const otherStock = await createStock(other.id, 'DeGiro', 'Apple');
      await db.insert(stockValuations).values([
        { stockId: ownerStock.id, valuation: '320.00', date: '2026-08-01' },
        { stockId: ownerStock.id, valuation: '350.00', date: '2026-09-01' },
        { stockId: otherStock.id, valuation: '999.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/stock-valuations').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((v: { stockId: string }) => v.stockId === ownerStock.id)).toBe(true);
    });
  });

  describe('POST /stock-valuations', () => {
    it('crea una valoración en una acción propia', async () => {
      const user = await createUser('crear@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-valuations')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, valuation: '350.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.stockId).toBe(stock.id);
      expect(res.body.valuation).toBe('350.00');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('H3 criterio 2: admite varias valoraciones en fechas distintas', async () => {
      const user = await createUser('varias-valoraciones@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/stock-valuations')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, valuation: '320.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/stock-valuations')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, valuation: '350.00', date: '2026-09-01' })
        .expect(201);

      const valuations = await db.query.stockValuations.findMany({ where: (v, { eq }) => eq(v.stockId, stock.id) });
      expect(valuations).toHaveLength(2);
    });

    it('valoración negativa → 400 (a diferencia del saldo bancario, no puede ser negativa)', async () => {
      const user = await createUser('valoracion-invalida@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-valuations')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, valuation: '-50.00', date: '2026-09-04' })
        .expect(400);
    });

    it('H3 criterio 5: crear una valoración sobre una acción ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerStock = await createStock(owner.id, 'BBVA', 'Inditex');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/stock-valuations')
        .set('Authorization', auth(token))
        .send({ stockId: ownerStock.id, valuation: '350.00', date: '2026-09-04' })
        .expect(404);
    });
  });

  describe('PATCH /stock-valuations/:id', () => {
    it('edita valoración y fecha', async () => {
      const user = await createUser('editar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      const [valuation] = await db
        .insert(stockValuations)
        .values({ stockId: stock.id, valuation: '320.00', date: '2026-08-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/stock-valuations/${valuation.id}`)
        .set('Authorization', auth(token))
        .send({ valuation: '350.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.valuation).toBe('350.00');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('una valoración de una acción ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const stock = await createStock(owner.id, 'BBVA', 'Inditex');
      const [valuation] = await db
        .insert(stockValuations)
        .values({ stockId: stock.id, valuation: '320.00', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/stock-valuations/${valuation.id}`)
        .set('Authorization', auth(token))
        .send({ valuation: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /stock-valuations/:id', () => {
    it('elimina una valoración, sin afectar a la acción ni a las demás valoraciones', async () => {
      const user = await createUser('eliminar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      const [valuationA] = await db
        .insert(stockValuations)
        .values({ stockId: stock.id, valuation: '320.00', date: '2026-08-01' })
        .returning();
      await db.insert(stockValuations).values({ stockId: stock.id, valuation: '350.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/stock-valuations/${valuationA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingValuations = await db.query.stockValuations.findMany({ where: (v, { eq }) => eq(v.stockId, stock.id) });
      expect(remainingValuations).toHaveLength(1);
      const stillThereStock = await db.query.stocks.findFirst({ where: (s, { eq }) => eq(s.id, stock.id) });
      expect(stillThereStock).toBeDefined();
    });

    it('una valoración de una acción ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const stock = await createStock(owner.id, 'BBVA', 'Inditex');
      const [valuation] = await db
        .insert(stockValuations)
        .values({ stockId: stock.id, valuation: '320.00', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/stock-valuations/${valuation.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.stockValuations.findFirst({ where: (v, { eq }) => eq(v.id, valuation.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
