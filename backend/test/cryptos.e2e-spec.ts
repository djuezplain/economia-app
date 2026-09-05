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

describe('Cripto (e2e) — spec 022 H1', () => {
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

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /cryptos', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/cryptos').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/cryptos').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo las posiciones propias', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(cryptos).values([
        { userId: owner.id, exchange: 'Binance', crypto: 'Bitcoin' },
        { userId: other.id, exchange: 'Kraken', crypto: 'Ethereum' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/cryptos').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].crypto).toBe('Bitcoin');
    });
  });

  describe('POST /cryptos', () => {
    it('crea una posición de cripto', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/cryptos')
        .set('Authorization', auth(token))
        .send({ exchange: 'Binance', crypto: 'Bitcoin' })
        .expect(201);

      expect(res.body.exchange).toBe('Binance');
      expect(res.body.crypto).toBe('Bitcoin');
    });

    it('H1 criterio 2: la misma posición (exchange/wallet + criptomoneda) dos veces → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/cryptos')
        .set('Authorization', auth(token))
        .send({ exchange: 'Binance', crypto: 'Bitcoin' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/cryptos')
        .set('Authorization', auth(token))
        .send({ exchange: 'Binance', crypto: 'Bitcoin' })
        .expect(409);
    });

    it('mismo exchange/wallet+criptomoneda pero de otro usuario no choca (aislamiento)', async () => {
      const userA = await createUser('usuario-a@example.com');
      const userB = await createUser('usuario-b@example.com');
      const tokenA = await login(userA.email);
      const tokenB = await login(userB.email);

      await request(app.getHttpServer())
        .post('/cryptos')
        .set('Authorization', auth(tokenA))
        .send({ exchange: 'Binance', crypto: 'Bitcoin' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/cryptos')
        .set('Authorization', auth(tokenB))
        .send({ exchange: 'Binance', crypto: 'Bitcoin' })
        .expect(201);
    });

    it('sin exchange/wallet o sin criptomoneda → 400', async () => {
      const user = await createUser('campos-obligatorios@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/cryptos')
        .set('Authorization', auth(token))
        .send({ exchange: 'Binance' })
        .expect(400);
    });
  });

  describe('PATCH /cryptos/:id', () => {
    it('edita exchange/wallet y criptomoneda', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [crypto] = await db.insert(cryptos).values({ userId: user.id, exchange: 'Binance', crypto: 'Bitcoin' }).returning();

      const res = await request(app.getHttpServer())
        .patch(`/cryptos/${crypto.id}`)
        .set('Authorization', auth(token))
        .send({ exchange: 'Kraken', crypto: 'Ethereum' })
        .expect(200);

      expect(res.body.exchange).toBe('Kraken');
      expect(res.body.crypto).toBe('Ethereum');
    });

    it('editar hacia un duplicado de otra posición propia → 409', async () => {
      const user = await createUser('editar-duplicado@example.com');
      const token = await login(user.email);
      await db.insert(cryptos).values({ userId: user.id, exchange: 'Kraken', crypto: 'Ethereum' });
      const [crypto] = await db.insert(cryptos).values({ userId: user.id, exchange: 'Binance', crypto: 'Bitcoin' }).returning();

      await request(app.getHttpServer())
        .patch(`/cryptos/${crypto.id}`)
        .set('Authorization', auth(token))
        .send({ exchange: 'Kraken', crypto: 'Ethereum' })
        .expect(409);
    });

    it('una posición ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [crypto] = await db.insert(cryptos).values({ userId: owner.id, exchange: 'Binance', crypto: 'Bitcoin' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/cryptos/${crypto.id}`)
        .set('Authorization', auth(token))
        .send({ crypto: 'Otra' })
        .expect(404);
    });
  });

  describe('DELETE /cryptos/:id', () => {
    it('H1 criterio 4: elimina la posición y, en cascada, sus historiales de compras y valoraciones', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [crypto] = await db.insert(cryptos).values({ userId: user.id, exchange: 'Binance', crypto: 'Bitcoin' }).returning();
      await db.insert(cryptoPurchases).values({ cryptoId: crypto.id, quantity: '0.10000000', purchasePrice: '30000.00', date: '2026-09-01' });
      await db.insert(cryptoValuations).values({ cryptoId: crypto.id, pricePerUnit: '35000.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/cryptos/${crypto.id}`).set('Authorization', auth(token)).expect(204);

      const remainingCryptos = await db.query.cryptos.findMany({ where: (c, { eq }) => eq(c.userId, user.id) });
      expect(remainingCryptos).toHaveLength(0);
      const remainingPurchases = await db.query.cryptoPurchases.findMany({ where: (p, { eq }) => eq(p.cryptoId, crypto.id) });
      expect(remainingPurchases).toHaveLength(0);
      const remainingValuations = await db.query.cryptoValuations.findMany({ where: (v, { eq }) => eq(v.cryptoId, crypto.id) });
      expect(remainingValuations).toHaveLength(0);
    });

    it('una posición ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [crypto] = await db.insert(cryptos).values({ userId: owner.id, exchange: 'Binance', crypto: 'Bitcoin' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/cryptos/${crypto.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.cryptos.findFirst({ where: (c, { eq }) => eq(c.id, crypto.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
