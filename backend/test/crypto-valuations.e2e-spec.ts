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

describe('Historial de valoraciones de cripto (e2e) — spec 022 H3', () => {
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

  describe('GET /crypto-valuations', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/crypto-valuations').expect(401);
    });

    it('lista solo las valoraciones de posiciones propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerCrypto = await createCrypto(owner.id, 'Binance', 'Bitcoin');
      const otherCrypto = await createCrypto(other.id, 'Kraken', 'Ethereum');
      await db.insert(cryptoValuations).values([
        { cryptoId: ownerCrypto.id, pricePerUnit: '32000.00000000', date: '2026-08-01' },
        { cryptoId: ownerCrypto.id, pricePerUnit: '35000.00000000', date: '2026-09-01' },
        { cryptoId: otherCrypto.id, pricePerUnit: '1900.00000000', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/crypto-valuations').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((v: { cryptoId: string }) => v.cryptoId === ownerCrypto.id)).toBe(true);
    });
  });

  describe('POST /crypto-valuations', () => {
    it('crea una valoración en una posición propia', async () => {
      const user = await createUser('crear@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/crypto-valuations')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, pricePerUnit: '35000.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.cryptoId).toBe(crypto.id);
      expect(res.body.pricePerUnit).toBe('35000.00000000');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('H3 criterio 2: admite hasta 8 decimales (altcoins que cotizan por debajo de 1 céntimo)', async () => {
      const user = await createUser('ocho-decimales@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Shiba Inu');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/crypto-valuations')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, pricePerUnit: '0.00003821', date: '2026-09-04' })
        .expect(201);

      expect(res.body.pricePerUnit).toBe('0.00003821');
    });

    it('más de 8 decimales → 400', async () => {
      const user = await createUser('nueve-decimales@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Shiba Inu');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/crypto-valuations')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, pricePerUnit: '0.000038211', date: '2026-09-04' })
        .expect(400);
    });

    it('H3 criterio 3: admite varias valoraciones en fechas distintas', async () => {
      const user = await createUser('varias-valoraciones@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/crypto-valuations')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, pricePerUnit: '32000.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/crypto-valuations')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, pricePerUnit: '35000.00', date: '2026-09-01' })
        .expect(201);

      const valuations = await db.query.cryptoValuations.findMany({ where: (v, { eq }) => eq(v.cryptoId, crypto.id) });
      expect(valuations).toHaveLength(2);
    });

    it('precio negativo → 400', async () => {
      const user = await createUser('precio-invalido@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/crypto-valuations')
        .set('Authorization', auth(token))
        .send({ cryptoId: crypto.id, pricePerUnit: '-50.00', date: '2026-09-04' })
        .expect(400);
    });

    it('H3 criterio 6: crear una valoración sobre una posición ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerCrypto = await createCrypto(owner.id, 'Binance', 'Bitcoin');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/crypto-valuations')
        .set('Authorization', auth(token))
        .send({ cryptoId: ownerCrypto.id, pricePerUnit: '35000.00', date: '2026-09-04' })
        .expect(404);
    });
  });

  describe('PATCH /crypto-valuations/:id', () => {
    it('edita precio y fecha', async () => {
      const user = await createUser('editar@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);
      const [valuation] = await db
        .insert(cryptoValuations)
        .values({ cryptoId: crypto.id, pricePerUnit: '32000.00000000', date: '2026-08-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/crypto-valuations/${valuation.id}`)
        .set('Authorization', auth(token))
        .send({ pricePerUnit: '35000.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.pricePerUnit).toBe('35000.00000000');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('una valoración de una posición ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const crypto = await createCrypto(owner.id, 'Binance', 'Bitcoin');
      const [valuation] = await db
        .insert(cryptoValuations)
        .values({ cryptoId: crypto.id, pricePerUnit: '32000.00000000', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/crypto-valuations/${valuation.id}`)
        .set('Authorization', auth(token))
        .send({ pricePerUnit: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /crypto-valuations/:id', () => {
    it('elimina una valoración, sin afectar a la posición ni a las demás valoraciones', async () => {
      const user = await createUser('eliminar@example.com');
      const crypto = await createCrypto(user.id, 'Binance', 'Bitcoin');
      const token = await login(user.email);
      const [valuationA] = await db
        .insert(cryptoValuations)
        .values({ cryptoId: crypto.id, pricePerUnit: '32000.00000000', date: '2026-08-01' })
        .returning();
      await db.insert(cryptoValuations).values({ cryptoId: crypto.id, pricePerUnit: '35000.00000000', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/crypto-valuations/${valuationA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingValuations = await db.query.cryptoValuations.findMany({ where: (v, { eq }) => eq(v.cryptoId, crypto.id) });
      expect(remainingValuations).toHaveLength(1);
      const stillThereCrypto = await db.query.cryptos.findFirst({ where: (c, { eq }) => eq(c.id, crypto.id) });
      expect(stillThereCrypto).toBeDefined();
    });

    it('una valoración de una posición ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const crypto = await createCrypto(owner.id, 'Binance', 'Bitcoin');
      const [valuation] = await db
        .insert(cryptoValuations)
        .values({ cryptoId: crypto.id, pricePerUnit: '32000.00000000', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/crypto-valuations/${valuation.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.cryptoValuations.findFirst({ where: (v, { eq }) => eq(v.id, valuation.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
