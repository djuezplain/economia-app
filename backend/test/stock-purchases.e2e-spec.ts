import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { stockPurchases, stockSales, stockValuations, stocks, users } from '../src/db/schema/index.js';

describe('Historial de compras de acciones (e2e) — spec 020 H2', () => {
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

  describe('GET /stock-purchases', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/stock-purchases').expect(401);
    });

    it('lista solo las compras de acciones propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerStock = await createStock(owner.id, 'BBVA', 'Inditex');
      const otherStock = await createStock(other.id, 'DeGiro', 'Apple');
      await db.insert(stockPurchases).values([
        { stockId: ownerStock.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' },
        { stockId: ownerStock.id, shareCount: '5.0000', purchasePrice: '32.00', date: '2026-09-01' },
        { stockId: otherStock.id, shareCount: '5.0000', purchasePrice: '150.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/stock-purchases').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((p: { stockId: string }) => p.stockId === ownerStock.id)).toBe(true);
    });
  });

  describe('POST /stock-purchases', () => {
    it('crea una compra en una acción propia', async () => {
      const user = await createUser('crear@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-09-04' })
        .expect(201);

      expect(res.body.stockId).toBe(stock.id);
      expect(res.body.shareCount).toBe('10.00000000');
      expect(res.body.purchasePrice).toBe('28.50000000');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('H2 criterio 1: admite un número de acciones fraccionario', async () => {
      const user = await createUser('fraccional@example.com');
      const stock = await createStock(user.id, 'DeGiro', 'Apple');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '0.5', purchasePrice: '150.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.shareCount).toBe('0.50000000');
    });

    it('H2 criterio 1 (revisión): número de acciones y precio de compra admiten hasta 8 decimales', async () => {
      const user = await createUser('ocho-decimales@example.com');
      const stock = await createStock(user.id, 'Kraken', 'BTC-tokenizado');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '0.12345678', purchasePrice: '28123.87654321', date: '2026-09-04' })
        .expect(201);

      expect(res.body.shareCount).toBe('0.12345678');
      expect(res.body.purchasePrice).toBe('28123.87654321');
    });

    it('más de 8 decimales en el número de acciones → 400', async () => {
      const user = await createUser('nueve-decimales-acciones@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '0.123456789', purchasePrice: '28.50', date: '2026-09-04' })
        .expect(400);
    });

    it('más de 8 decimales en el precio de compra → 400', async () => {
      const user = await createUser('nueve-decimales-precio@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '10', purchasePrice: '28.123456789', date: '2026-09-04' })
        .expect(400);
    });

    it('H2 criterio 2: admite varias compras en la misma acción, en fechas distintas', async () => {
      const user = await createUser('varias-compras@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '5', purchasePrice: '28.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '5', purchasePrice: '32.00', date: '2026-09-01' })
        .expect(201);

      const purchases = await db.query.stockPurchases.findMany({ where: (p, { eq }) => eq(p.stockId, stock.id) });
      expect(purchases).toHaveLength(2);
    });

    it('H2 criterio 6: crear una compra sobre una acción ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerStock = await createStock(owner.id, 'BBVA', 'Inditex');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: ownerStock.id, shareCount: '5', purchasePrice: '28.00', date: '2026-09-04' })
        .expect(404);
    });

    it('número de acciones negativo o cero → 400', async () => {
      const user = await createUser('acciones-invalidas@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '-5', purchasePrice: '28.00', date: '2026-09-04' })
        .expect(400);
    });

    it('sin fecha → 400', async () => {
      const user = await createUser('sin-fecha@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-purchases')
        .set('Authorization', auth(token))
        .send({ stockId: stock.id, shareCount: '5', purchasePrice: '28.00' })
        .expect(400);
    });
  });

  describe('PATCH /stock-purchases/:id', () => {
    it('edita número de acciones, precio de compra y fecha', async () => {
      const user = await createUser('editar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      const [purchase] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/stock-purchases/${purchase.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '12', purchasePrice: '29.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.shareCount).toBe('12.00000000');
      expect(res.body.purchasePrice).toBe('29.00000000');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('una compra de una acción ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const stock = await createStock(owner.id, 'BBVA', 'Inditex');
      const [purchase] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/stock-purchases/${purchase.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '999' })
        .expect(404);
    });

    it('spec 031 H1 criterio 4: bajar la cantidad sin dejar ventas sin cubrir se permite', async () => {
      const user = await createUser('baja-sin-afectar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const [purchase] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' });
      const token = await login(user.email);

      await request(app.getHttpServer())
        .patch(`/stock-purchases/${purchase.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '5' })
        .expect(200);
    });

    it('spec 031 H1 criterio 4: bajar la cantidad por debajo de lo ya vendido → 400, sin aplicar el cambio', async () => {
      const user = await createUser('baja-deja-sin-cubrir@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const [purchase] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' });
      const token = await login(user.email);

      await request(app.getHttpServer())
        .patch(`/stock-purchases/${purchase.id}`)
        .set('Authorization', auth(token))
        .send({ shareCount: '3' })
        .expect(400);

      const stillThere = await db.query.stockPurchases.findFirst({ where: (p, { eq }) => eq(p.id, purchase.id) });
      expect(stillThere?.shareCount).toBe('10.00000000');
    });
  });

  describe('DELETE /stock-purchases/:id', () => {
    it('elimina una compra, sin afectar a la acción ni a las demás compras', async () => {
      const user = await createUser('eliminar@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const token = await login(user.email);
      const [purchaseA] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '5.0000', purchasePrice: '30.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/stock-purchases/${purchaseA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingPurchases = await db.query.stockPurchases.findMany({ where: (p, { eq }) => eq(p.stockId, stock.id) });
      expect(remainingPurchases).toHaveLength(1);
      const stillThereStock = await db.query.stocks.findFirst({ where: (s, { eq }) => eq(s.id, stock.id) });
      expect(stillThereStock).toBeDefined();
    });

    it('una compra de una acción ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const stock = await createStock(owner.id, 'BBVA', 'Inditex');
      const [purchase] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/stock-purchases/${purchase.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.stockPurchases.findFirst({ where: (p, { eq }) => eq(p.id, purchase.id) });
      expect(stillThere).toBeDefined();
    });

    it('spec 031 H1 criterio 4: borrar una compra sin ventas se permite (caso común, sin comprobación extra)', async () => {
      const user = await createUser('borra-sin-ventas@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const [purchase] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      const token = await login(user.email);

      await request(app.getHttpServer()).delete(`/stock-purchases/${purchase.id}`).set('Authorization', auth(token)).expect(204);
    });

    it('spec 031 H1 criterio 4: borrar una compra cuyas acciones ya se vendieron → 400, sin borrarla', async () => {
      const user = await createUser('borra-deja-sin-cubrir@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const [purchase] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' });
      const token = await login(user.email);

      await request(app.getHttpServer()).delete(`/stock-purchases/${purchase.id}`).set('Authorization', auth(token)).expect(400);

      const stillThere = await db.query.stockPurchases.findFirst({ where: (p, { eq }) => eq(p.id, purchase.id) });
      expect(stillThere).toBeDefined();
    });

    it('spec 031 H1 criterio 4: borrar una compra con otra compra que sigue cubriendo la venta se permite', async () => {
      const user = await createUser('borra-cubierta-por-otra@example.com');
      const stock = await createStock(user.id, 'BBVA', 'Inditex');
      const [purchaseA] = await db
        .insert(stockPurchases)
        .values({ stockId: stock.id, shareCount: '10', purchasePrice: '28.50', date: '2026-08-01' })
        .returning();
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '5', purchasePrice: '29.00', date: '2026-08-10' });
      await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4', salePrice: '30.00', date: '2026-08-15' });
      const token = await login(user.email);

      await request(app.getHttpServer()).delete(`/stock-purchases/${purchaseA.id}`).set('Authorization', auth(token)).expect(204);
    });
  });
});
