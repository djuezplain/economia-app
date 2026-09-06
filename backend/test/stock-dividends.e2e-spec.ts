import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { stockDividends, stocks, users } from '../src/db/schema/index.js';

describe('Historial de dividendos de acciones (e2e) — spec 029 H1', () => {
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
    await db.delete(stockDividends);
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

  describe('GET /stock-dividends', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/stock-dividends').expect(401);
    });

    it('lista solo los dividendos de acciones propias, ordenados del más reciente al más antiguo', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerStock = await createStock(owner.id, 'BBVA', 'Inditex');
      const otherStock = await createStock(other.id, 'DeGiro', 'Apple');
      await db.insert(stockDividends).values([
        { stockId: ownerStock.id, netAmount: '40.50', date: '2026-08-01' },
        { stockId: ownerStock.id, netAmount: '81.00', date: '2026-09-01' },
        { stockId: otherStock.id, netAmount: '10.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/stock-dividends').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((d: { stockId: string }) => d.stockId === ownerStock.id)).toBe(true);
    });
  });

  describe('POST /stock-dividends', () => {
    it('crea un dividendo en una acción propia, con % de retención por defecto (19.00)', async () => {
      const user = await createUser('crear@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-dividends')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, netAmount: '81.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.stockId).toBe(stock.id);
      expect(res.body.netAmount).toBe('81.00');
      expect(res.body.retentionPercent).toBe('19.00');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('admite un % de retención distinto del 19% por defecto', async () => {
      const user = await createUser('retencion@example.com');
      const stock = await createStock(user.id, 'DeGiro', 'Apple (extranjera)');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-dividends')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, netAmount: '85.00', retentionPercent: '15', date: '2026-09-04' })
        .expect(201);

      expect(res.body.retentionPercent).toBe('15.00');
    });

    it('crear un dividendo sobre una acción ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerStock = await createStock(owner.id, 'BBVA', 'Inditex');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/stock-dividends')
        .set('Authorization', auth(token))
        .send({ stockId: ownerStock.id, netAmount: '10.00', date: '2026-09-04' })
        .expect(404);
    });

    it('importe neto negativo o cero → 400', async () => {
      const user = await createUser('importe-invalido@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-dividends')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, netAmount: '-10.00', date: '2026-09-04' })
        .expect(400);
    });

    it('% de retención de 100 → 400 (dejaría el bruto sin definir)', async () => {
      const user = await createUser('retencion-100@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-dividends')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, netAmount: '10.00', retentionPercent: '100', date: '2026-09-04' })
        .expect(400);
    });

    it('% de retención negativo → 400', async () => {
      const user = await createUser('retencion-negativa@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-dividends')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, netAmount: '10.00', retentionPercent: '-1', date: '2026-09-04' })
        .expect(400);
    });

    it('sin fecha → 400', async () => {
      const user = await createUser('sin-fecha@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-dividends')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, netAmount: '10.00' })
        .expect(400);
    });
  });

  describe('PATCH /stock-dividends/:id', () => {
    it('edita importe neto, % de retención y fecha', async () => {
      const user = await createUser('editar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      const [dividend] = await db.insert(stockDividends).values({ stockId: stock.id, netAmount: '40.00', date: '2026-08-01' }).returning();

      const res = await request(app.getHttpServer())
        .patch(`/stock-dividends/${dividend.id}`)
        .set('Authorization', auth(token))
        .send({ netAmount: '50.00', retentionPercent: '21', date: '2026-09-01' })
        .expect(200);

      expect(res.body.netAmount).toBe('50.00');
      expect(res.body.retentionPercent).toBe('21.00');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('un dividendo de una acción ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const stock = await createStock(owner.id, 'BBVA', 'Inditex');
      const [dividend] = await db.insert(stockDividends).values({ stockId: stock.id, netAmount: '40.00', date: '2026-08-01' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/stock-dividends/${dividend.id}`)
        .set('Authorization', auth(token))
        .send({ netAmount: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /stock-dividends/:id', () => {
    it('elimina un dividendo, sin afectar a la acción ni a los demás dividendos', async () => {
      const user = await createUser('eliminar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      const [dividendA] = await db.insert(stockDividends).values({ stockId: stock.id, netAmount: '40.00', date: '2026-08-01' }).returning();
      await db.insert(stockDividends).values({ stockId: stock.id, netAmount: '30.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/stock-dividends/${dividendA.id}`).set('Authorization', auth(token)).expect(204);

      const remaining = await db.query.stockDividends.findMany({ where: (d, { eq }) => eq(d.stockId, stock.id) });
      expect(remaining).toHaveLength(1);
      const stillThereStock = await db.query.stocks.findFirst({ where: (s, { eq }) => eq(s.id, stock.id) });
      expect(stillThereStock).toBeDefined();
    });

    it('un dividendo de una acción ajena → 404, sin borrarlo', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const stock = await createStock(owner.id, 'BBVA', 'Inditex');
      const [dividend] = await db.insert(stockDividends).values({ stockId: stock.id, netAmount: '40.00', date: '2026-08-01' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/stock-dividends/${dividend.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.stockDividends.findFirst({ where: (d, { eq }) => eq(d.id, dividend.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
