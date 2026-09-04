import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { stockEntries, users } from '../src/db/schema/index.js';

describe('Entradas de acciones (e2e) — spec 018 H3', () => {
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
    await db.delete(stockEntries);
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

  describe('GET /stock-entries', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/stock-entries').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/stock-entries').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo las entradas propias', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(stockEntries).values([
        {
          userId: owner.id,
          custodyBank: 'BBVA',
          stock: 'Inditex',
          shareCount: '10.0000',
          purchasePrice: '30.00',
          currentValuation: '35.00',
        },
        {
          userId: other.id,
          custodyBank: 'Santander',
          stock: 'Repsol',
          shareCount: '5.0000',
          purchasePrice: '12.00',
          currentValuation: '13.00',
        },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/stock-entries').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].stock).toBe('Inditex');
    });
  });

  describe('POST /stock-entries', () => {
    it('crea una entrada', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-entries')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Inditex', shareCount: '10', purchasePrice: '30.00', currentValuation: '35.00' })
        .expect(201);

      expect(res.body.custodyBank).toBe('BBVA');
      expect(res.body.stock).toBe('Inditex');
      expect(res.body.shareCount).toBe('10.0000');
      expect(res.body.purchasePrice).toBe('30.00');
      expect(res.body.currentValuation).toBe('35.00');
    });

    it('H3 criterio 2: admite un número de acciones fraccionario', async () => {
      const user = await createUser('fraccional@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/stock-entries')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Apple', shareCount: '0.5', purchasePrice: '150.00', currentValuation: '160.00' })
        .expect(201);

      expect(res.body.shareCount).toBe('0.5000');
    });

    it('H3 criterio 3: admite varias entradas de la misma acción', async () => {
      const user = await createUser('varias-compras@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/stock-entries')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Inditex', shareCount: '5', purchasePrice: '28.00', currentValuation: '35.00' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/stock-entries')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Inditex', shareCount: '5', purchasePrice: '32.00', currentValuation: '35.00' })
        .expect(201);

      const entries = await db.query.stockEntries.findMany({ where: (e, { eq }) => eq(e.userId, user.id) });
      expect(entries).toHaveLength(2);
    });

    it('número de acciones negativo o cero → 400', async () => {
      const user = await createUser('acciones-invalidas@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-entries')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Inditex', shareCount: '-5', purchasePrice: '30.00', currentValuation: '35.00' })
        .expect(400);
    });

    it('precio de compra negativo → 400', async () => {
      const user = await createUser('precio-invalido@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/stock-entries')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'BBVA', stock: 'Inditex', shareCount: '5', purchasePrice: '-30.00', currentValuation: '35.00' })
        .expect(400);
    });
  });

  describe('PATCH /stock-entries/:id', () => {
    it('edita los campos', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [entry] = await db
        .insert(stockEntries)
        .values({
          userId: user.id,
          custodyBank: 'BBVA',
          stock: 'Inditex',
          shareCount: '10.0000',
          purchasePrice: '30.00',
          currentValuation: '35.00',
        })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/stock-entries/${entry.id}`)
        .set('Authorization', auth(token))
        .send({ currentValuation: '40.00' })
        .expect(200);

      expect(res.body.currentValuation).toBe('40.00');
      expect(res.body.stock).toBe('Inditex'); // resto de campos sin cambios
    });

    it('una entrada ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [entry] = await db
        .insert(stockEntries)
        .values({
          userId: owner.id,
          custodyBank: 'BBVA',
          stock: 'Inditex',
          shareCount: '10.0000',
          purchasePrice: '30.00',
          currentValuation: '35.00',
        })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/stock-entries/${entry.id}`)
        .set('Authorization', auth(token))
        .send({ currentValuation: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /stock-entries/:id', () => {
    it('elimina una entrada propia', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [entry] = await db
        .insert(stockEntries)
        .values({
          userId: user.id,
          custodyBank: 'BBVA',
          stock: 'Inditex',
          shareCount: '10.0000',
          purchasePrice: '30.00',
          currentValuation: '35.00',
        })
        .returning();

      await request(app.getHttpServer()).delete(`/stock-entries/${entry.id}`).set('Authorization', auth(token)).expect(204);

      const remaining = await db.query.stockEntries.findMany({ where: (e, { eq }) => eq(e.userId, user.id) });
      expect(remaining).toHaveLength(0);
    });

    it('una entrada ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [entry] = await db
        .insert(stockEntries)
        .values({
          userId: owner.id,
          custodyBank: 'BBVA',
          stock: 'Inditex',
          shareCount: '10.0000',
          purchasePrice: '30.00',
          currentValuation: '35.00',
        })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/stock-entries/${entry.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.stockEntries.findFirst({ where: (e, { eq }) => eq(e.id, entry.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
