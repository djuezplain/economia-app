import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { stockDividends, stockPurchases, stockSales, stockValuations, stocks, users } from '../src/db/schema/index.js';

describe('Acciones (e2e) — spec 020 H1', () => {
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
    await db.delete(stockSales);
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

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /stocks', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/stocks').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/stocks').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo las acciones propias', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(stocks).values([
        { userId: owner.id, custodyBank: 'BBVA', stock: 'Inditex' },
        { userId: other.id, custodyBank: 'DeGiro', stock: 'Apple' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/stocks').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].stock).toBe('Inditex');
    });
  });

  describe('POST /stocks', () => {
    it('crea una acción', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stocks')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Inditex' })
        .expect(201);

      expect(res.body.custodyBank).toBe('BBVA');
      expect(res.body.stock).toBe('Inditex');
    });

    it('H1 criterio 2: la misma acción (banco custodia + acción) dos veces → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stocks')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Inditex' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/stocks')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Inditex' })
        .expect(409);
    });

    it('mismo banco custodia+acción pero de otro usuario no choca (aislamiento)', async () => {
      const userA = await createUser('usuario-a@example.com');
      const userB = await createUser('usuario-b@example.com');
      const tokenA = await login(userA.email);
      const tokenB = await login(userB.email);

      await request(app.getHttpServer())
        .post('/stocks')
        .set('Authorization', auth(tokenA))
        .send({ custodyBank: 'BBVA', stock: 'Inditex' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/stocks')
        .set('Authorization', auth(tokenB))
        .send({ custodyBank: 'BBVA', stock: 'Inditex' })
        .expect(201);
    });

    it('sin banco custodia o sin acción → 400', async () => {
      const user = await createUser('campos-obligatorios@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stocks')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA' })
        .expect(400);
    });
  });

  describe('PATCH /stocks/:id', () => {
    it('edita banco custodia y acción', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [stock] = await db.insert(stocks).values({ userId: user.id, custodyBank: 'BBVA', stock: 'Inditex' }).returning();

      const res = await request(app.getHttpServer())
        .patch(`/stocks/${stock.id}`)
        .set('Authorization', auth(token))
        .send({ custodyBank: 'DeGiro', stock: 'Apple' })
        .expect(200);

      expect(res.body.custodyBank).toBe('DeGiro');
      expect(res.body.stock).toBe('Apple');
    });

    it('editar hacia un duplicado de otra acción propia → 409', async () => {
      const user = await createUser('editar-duplicado@example.com');
      const token = await login(user.email);
      await db.insert(stocks).values({ userId: user.id, custodyBank: 'DeGiro', stock: 'Apple' });
      const [stock] = await db.insert(stocks).values({ userId: user.id, custodyBank: 'BBVA', stock: 'Inditex' }).returning();

      await request(app.getHttpServer())
        .patch(`/stocks/${stock.id}`)
        .set('Authorization', auth(token))
        .send({ custodyBank: 'DeGiro', stock: 'Apple' })
        .expect(409);
    });

    it('una acción ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [stock] = await db.insert(stocks).values({ userId: owner.id, custodyBank: 'BBVA', stock: 'Inditex' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/stocks/${stock.id}`)
        .set('Authorization', auth(token))
        .send({ stock: 'Otra' })
        .expect(404);
    });
  });

  describe('DELETE /stocks/:id', () => {
    it('H1 criterio 4: elimina la acción y, en cascada, sus historiales de compras, ventas, valoraciones y dividendos', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [stock] = await db.insert(stocks).values({ userId: user.id, custodyBank: 'BBVA', stock: 'Inditex' }).returning();
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-09-01' });
      await db.insert(stockSales).values({ stockId: stock.id, shareCount: '4.0000', salePrice: '30.00', date: '2026-09-01' });
      await db.insert(stockValuations).values({ stockId: stock.id, pricePerShare: '350.00', date: '2026-09-01' });
      await db.insert(stockDividends).values({ stockId: stock.id, netAmount: '40.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/stocks/${stock.id}`).set('Authorization', auth(token)).expect(204);

      const remainingStocks = await db.query.stocks.findMany({ where: (s, { eq }) => eq(s.userId, user.id) });
      expect(remainingStocks).toHaveLength(0);
      const remainingPurchases = await db.query.stockPurchases.findMany({ where: (p, { eq }) => eq(p.stockId, stock.id) });
      expect(remainingPurchases).toHaveLength(0);
      const remainingSales = await db.query.stockSales.findMany({ where: (s, { eq }) => eq(s.stockId, stock.id) });
      expect(remainingSales).toHaveLength(0);
      const remainingValuations = await db.query.stockValuations.findMany({ where: (v, { eq }) => eq(v.stockId, stock.id) });
      expect(remainingValuations).toHaveLength(0);
      const remainingDividends = await db.query.stockDividends.findMany({ where: (d, { eq }) => eq(d.stockId, stock.id) });
      expect(remainingDividends).toHaveLength(0);
    });

    it('una acción ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [stock] = await db.insert(stocks).values({ userId: owner.id, custodyBank: 'BBVA', stock: 'Inditex' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/stocks/${stock.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.stocks.findFirst({ where: (s, { eq }) => eq(s.id, stock.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
