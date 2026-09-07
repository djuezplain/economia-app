import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { stockPurchases, stockSales, stocks, users } from '../src/db/schema/index.js';

describe('Historial de ventas de acciones (e2e) — spec 031 H1', () => {
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
    await db.delete(stockSales);
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

  describe('GET /stock-sales', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/stock-sales').expect(401);
    });

    it('lista solo las ventas de acciones propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerStock = await createStock(owner.id, 'BBVA', 'Inditex');
      const otherStock = await createStock(other.id, 'DeGiro', 'Apple');
      await db.insert(stockPurchases).values({ stockId: ownerStock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      await db.insert(stockPurchases).values({ stockId: otherStock.id, shareCount: '10', purchasePrice: '150.00', date: '2026-08-01' });
      await db.insert(stockSales).values([
        { stockId: ownerStock.id, shareCount: '2', salePrice: '30.00', date: '2026-08-15' },
        { stockId: ownerStock.id, shareCount: '3', salePrice: '32.00', date: '2026-09-01' },
        { stockId: otherStock.id, shareCount: '1', salePrice: '160.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/stock-sales').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-15');
      expect(res.body.every((s: { stockId: string }) => s.stockId === ownerStock.id)).toBe(true);
    });
  });

  describe('POST /stock-sales', () => {
    it('crea una venta cuando quedan suficientes acciones en cartera', async () => {
      const user = await createUser('crear@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-sales')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '4', salePrice: '32.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.stockId).toBe(stock.id);
      expect(res.body.shareCount).toBe('4.00000000');
      expect(res.body.salePrice).toBe('32.00000000');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('vender exactamente todo lo disponible está permitido (límite)', async () => {
      const user = await createUser('limite@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/stock-sales')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '10', salePrice: '32.00', date: '2026-09-04' })
        .expect(201);
    });

    it('vender más de lo disponible en cartera → 400, sin crear la venta', async () => {
      const user = await createUser('exceso@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/stock-sales')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '10.00000001', salePrice: '32.00', date: '2026-09-04' })
        .expect(400);

      const sales = await db.query.stockSales.findMany({ where: (s, { eq }) => eq(s.stockId, stock.id) });
      expect(sales).toHaveLength(0);
    });

    it('descuenta ventas ya registradas antes de comprobar lo disponible', async () => {
      const user = await createUser('descuenta@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      await db.insert(stockSales).values({ stockId: stock.id, shareCount: '7', salePrice: '30.00', date: '2026-08-15' });
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/stock-sales')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '4', salePrice: '32.00', date: '2026-09-04' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/stock-sales')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '3', salePrice: '32.00', date: '2026-09-04' })
        .expect(201);
    });

    it('crear una venta sobre una acción ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerStock = await createStock(owner.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: ownerStock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/stock-sales')
        .set('Authorization', auth(token))
        .send({ stockId: ownerStock.id, shareCount: '1', salePrice: '32.00', date: '2026-09-04' })
        .expect(404);
    });

    it('sin fecha → 400', async () => {
      const user = await createUser('sin-fecha@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-sales')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '1', salePrice: '32.00' })
        .expect(400);
    });
  });

  describe('PATCH /stock-sales/:id', () => {
    it('edita cantidad, precio de venta y fecha', async () => {
      const user = await createUser('editar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const [sale] = await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' }).returning();
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .patch(`/stock-sales/${sale.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '6', salePrice: '31.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.shareCount).toBe('6.00000000');
      expect(res.body.salePrice).toBe('31.00000000');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('editar una venta propia sin superar lo disponible (no se compara contra sí misma)', async () => {
      const user = await createUser('sin-comparar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const [sale] = await db.insert(stockSales).values({ stockId: stock.id, shareCount: '10', salePrice: '30.00', date: '2026-08-15' }).returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .patch(`/stock-sales/${sale.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '10' })
        .expect(200);
    });

    it('editar una venta subiendo la cantidad por encima de lo disponible → 400', async () => {
      const user = await createUser('sube-cantidad@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const [sale] = await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' }).returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .patch(`/stock-sales/${sale.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '11' })
        .expect(400);
    });

    it('una venta de una acción ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const stock = await createStock(owner.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const [sale] = await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).patch(`/stock-sales/${sale.id}`).set('Authorization', auth(token)).send({ shareCount: '1' }).expect(404);
    });
  });

  describe('DELETE /stock-sales/:id', () => {
    it('elimina una venta, sin afectar a la acción ni a las demás ventas', async () => {
      const user = await createUser('eliminar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const [saleA] = await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' }).returning();
      await db.insert(stockSales).values({ stockId: stock.id, shareCount: '3', salePrice: '31.00', date: '2026-09-01' });

      const token = await login(user.email);
      await request(app.getHttpServer()).delete(`/stock-sales/${saleA.id}`).set('Authorization', auth(token)).expect(204);

      const remaining = await db.query.stockSales.findMany({ where: (s, { eq }) => eq(s.stockId, stock.id) });
      expect(remaining).toHaveLength(1);
      const stillThereStock = await db.query.stocks.findFirst({ where: (s, { eq }) => eq(s.id, stock.id) });
      expect(stillThereStock).toBeDefined();
    });

    it('una venta de una acción ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const stock = await createStock(owner.id, 'BBVA', 'Inditex');
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' });
      const [sale] = await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/stock-sales/${sale.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.stockSales.findFirst({ where: (s, { eq }) => eq(s.id, sale.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
