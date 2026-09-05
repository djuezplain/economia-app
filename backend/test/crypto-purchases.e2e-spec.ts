import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { cryptoPurchases, cryptoValuations, cryptos, users } from '../src/db/schema/index.js';

describe('Historial de compras de cripto (e2e) — spec 022 H2', () => {
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
    await db.delete(cryptoValuations);
    await db.delete(cryptoPurchases);
    await db.delete(cryptos);
    await db.delete(users);
  });

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function createCrypto(userId: string, exchange: string, crypto: string) {
    const [entity] = await db.insert(cryptos).values({ userId, exchange, crypto }).returning();
    return entity;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /crypto-purchases', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/crypto-purchases').expect(401);
    });

    it('lista solo las compras de posiciones propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerCrypto = await createCrypto(owner.id, 'Binance', 'Bitcoin');
      const otherCrypto = await createCrypto(other.id, 'Kraken', 'Ethereum');
      await db.insert(cryptoPurchases).values([
        { cryptoId: ownerCrypto.id, quantity: '0.10000000', purchasePrice: '28000.00', date: '2026-08-01' },
        { cryptoId: ownerCrypto.id, quantity: '0.05000000', purchasePrice: '32000.00', date: '2026-09-01' },
        { cryptoId: otherCrypto.id, quantity: '1.00000000', purchasePrice: '1800.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/crypto-purchases').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((p: { cryptoId: string }) => p.cryptoId === ownerCrypto.id)).toBe(true);
    });
  });

  describe('POST /crypto-purchases', () => {
    it('crea una compra en una posición propia', async () => {
      const user = await createUser('crear@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '0.1', purchasePrice: '30000.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.cryptoId).toBe(crypto.id);
      expect(res.body.quantity).toBe('0.10000000');
      expect(res.body.purchasePrice).toBe('30000.00000000');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('H2 criterio 1: admite hasta 8 decimales en cantidad y precio de compra (p. ej. satoshis y altcoins muy baratas)', async () => {
      const user = await createUser('ocho-decimales@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Shiba Inu');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '0.00000001', purchasePrice: '0.00003821', date: '2026-09-04' })
        .expect(201);

      expect(res.body.quantity).toBe('0.00000001');
      expect(res.body.purchasePrice).toBe('0.00003821');
    });

    it('admite cantidades enteras muy grandes (memecoins)', async () => {
      const user = await createUser('cantidad-grande@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Shiba Inu');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '1000000000', purchasePrice: '0.00003821', date: '2026-09-04' })
        .expect(201);

      expect(res.body.quantity).toBe('1000000000.00000000');
    });

    it('más de 8 decimales en la cantidad → 400', async () => {
      const user = await createUser('nueve-decimales-cantidad@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '0.123456789', purchasePrice: '30000.00', date: '2026-09-04' })
        .expect(400);
    });

    it('más de 8 decimales en el precio de compra → 400', async () => {
      const user = await createUser('nueve-decimales-precio@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '0.1', purchasePrice: '30000.123456789', date: '2026-09-04' })
        .expect(400);
    });

    it('H2 criterio 2: admite varias compras en la misma posición, en fechas distintas', async () => {
      const user = await createUser('varias-compras@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '0.05', purchasePrice: '28000.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '0.05', purchasePrice: '32000.00', date: '2026-09-01' })
        .expect(201);

      const purchases = await db.query.cryptoPurchases.findMany({ where: (p, { eq }) => eq(p.cryptoId, crypto.id) });
      expect(purchases).toHaveLength(2);
    });

    it('H2 criterio 6: crear una compra sobre una posición ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerCrypto = await createCrypto(owner.id, 'Binance', 'Bitcoin');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: ownerCrypto.id, quantity: '0.05', purchasePrice: '28000.00', date: '2026-09-04' })
        .expect(404);
    });

    it('cantidad negativa o cero → 400', async () => {
      const user = await createUser('cantidad-invalida@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '-0.5', purchasePrice: '28000.00', date: '2026-09-04' })
        .expect(400);
    });

    it('sin fecha → 400', async () => {
      const user = await createUser('sin-fecha@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/crypto-purchases')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, quantity: '0.05', purchasePrice: '28000.00' })
        .expect(400);
    });
  });

  describe('PATCH /crypto-purchases/:id', () => {
    it('edita cantidad, precio de compra y fecha', async () => {
      const user = await createUser('editar@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);
      const [purchase] = await db
        .insert(cryptoPurchases)
        .values({ cryptoId: crypto.id, quantity: '0.10000000', purchasePrice: '28000.00', date: '2026-08-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/crypto-purchases/${purchase.id}`)
        .set('Authorization', auth(token))
        .send({ quantity: '0.12', purchasePrice: '29000.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.quantity).toBe('0.12000000');
      expect(res.body.purchasePrice).toBe('29000.00000000');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('una compra de una posición ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const crypto = await createCrypto(owner.id, 'Binance', 'Bitcoin');
      const [purchase] = await db
        .insert(cryptoPurchases)
        .values({ cryptoId: crypto.id, quantity: '0.10000000', purchasePrice: '28000.00', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/crypto-purchases/${purchase.id}`)
        .set('Authorization', auth(token))
        .send({ quantity: '99' })
        .expect(404);
    });
  });

  describe('DELETE /crypto-purchases/:id', () => {
    it('elimina una compra, sin afectar a la posición ni a las demás compras', async () => {
      const user = await createUser('eliminar@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);
      const [purchaseA] = await db
        .insert(cryptoPurchases)
        .values({ cryptoId: crypto.id, quantity: '0.10000000', purchasePrice: '28000.00', date: '2026-08-01' })
        .returning();
      await db.insert(cryptoPurchases).values({ cryptoId: crypto.id, quantity: '0.05000000', purchasePrice: '30000.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/crypto-purchases/${purchaseA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingPurchases = await db.query.cryptoPurchases.findMany({ where: (p, { eq }) => eq(p.cryptoId, crypto.id) });
      expect(remainingPurchases).toHaveLength(1);
      const stillThereCrypto = await db.query.cryptos.findFirst({ where: (c, { eq }) => eq(c.id, crypto.id) });
      expect(stillThereCrypto).toBeDefined();
    });

    it('una compra de una posición ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const crypto = await createCrypto(owner.id, 'Binance', 'Bitcoin');
      const [purchase] = await db
        .insert(cryptoPurchases)
        .values({ cryptoId: crypto.id, quantity: '0.10000000', purchasePrice: '28000.00', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/crypto-purchases/${purchase.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.cryptoPurchases.findFirst({ where: (p, { eq }) => eq(p.id, purchase.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
