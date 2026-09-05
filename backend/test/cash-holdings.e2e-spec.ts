import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { cashBalances, cashHoldings, users } from '../src/db/schema/index.js';

describe('Efectivo (e2e) — spec 025 H1', () => {
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
    await db.delete(cashBalances);
    await db.delete(cashHoldings);
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

  describe('GET /cash-holdings', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/cash-holdings').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/cash-holdings').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo las ubicaciones propias', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(cashHoldings).values([
        { userId: owner.id, location: 'Cartera' },
        { userId: other.id, location: 'Caja fuerte' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/cash-holdings').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].location).toBe('Cartera');
    });
  });

  describe('POST /cash-holdings', () => {
    it('crea una ubicación', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/cash-holdings')
        .set('Authorization', auth(token))
        .send({ location: 'Cartera' })
        .expect(201);

      expect(res.body.location).toBe('Cartera');
    });

    it('H1 criterio 2: la misma ubicación dos veces → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer()).post('/cash-holdings').set('Authorization', auth(token)).send({ location: 'Cartera' }).expect(201);

      await request(app.getHttpServer()).post('/cash-holdings').set('Authorization', auth(token)).send({ location: 'Cartera' }).expect(409);
    });

    it('misma ubicación pero de otro usuario no choca (aislamiento)', async () => {
      const userA = await createUser('usuario-a@example.com');
      const userB = await createUser('usuario-b@example.com');
      const tokenA = await login(userA.email);
      const tokenB = await login(userB.email);

      await request(app.getHttpServer()).post('/cash-holdings').set('Authorization', auth(tokenA)).send({ location: 'Cartera' }).expect(201);
      await request(app.getHttpServer()).post('/cash-holdings').set('Authorization', auth(tokenB)).send({ location: 'Cartera' }).expect(201);
    });

    it('sin ubicación → 400', async () => {
      const user = await createUser('campos-obligatorios@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer()).post('/cash-holdings').set('Authorization', auth(token)).send({}).expect(400);
    });
  });

  describe('PATCH /cash-holdings/:id', () => {
    it('edita la ubicación', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [holding] = await db.insert(cashHoldings).values({ userId: user.id, location: 'Cartera' }).returning();

      const res = await request(app.getHttpServer())
        .patch(`/cash-holdings/${holding.id}`)
        .set('Authorization', auth(token))
        .send({ location: 'Caja fuerte' })
        .expect(200);

      expect(res.body.location).toBe('Caja fuerte');
    });

    it('editar hacia un duplicado de otra ubicación propia → 409', async () => {
      const user = await createUser('editar-duplicado@example.com');
      const token = await login(user.email);
      await db.insert(cashHoldings).values({ userId: user.id, location: 'Caja fuerte' });
      const [holding] = await db.insert(cashHoldings).values({ userId: user.id, location: 'Cartera' }).returning();

      await request(app.getHttpServer())
        .patch(`/cash-holdings/${holding.id}`)
        .set('Authorization', auth(token))
        .send({ location: 'Caja fuerte' })
        .expect(409);
    });

    it('editar sin cambiar la ubicación no choca consigo misma', async () => {
      const user = await createUser('editar-sin-cambios@example.com');
      const token = await login(user.email);
      const [holding] = await db.insert(cashHoldings).values({ userId: user.id, location: 'Cartera' }).returning();

      await request(app.getHttpServer())
        .patch(`/cash-holdings/${holding.id}`)
        .set('Authorization', auth(token))
        .send({ location: 'Cartera' })
        .expect(200);
    });

    it('una ubicación ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [holding] = await db.insert(cashHoldings).values({ userId: owner.id, location: 'Cartera' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/cash-holdings/${holding.id}`)
        .set('Authorization', auth(token))
        .send({ location: 'Otro' })
        .expect(404);
    });
  });

  describe('DELETE /cash-holdings/:id', () => {
    it('H1 criterio 4: elimina la ubicación y, en cascada, todo su historial de importes', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [holding] = await db.insert(cashHoldings).values({ userId: user.id, location: 'Cartera' }).returning();
      await db.insert(cashBalances).values([
        { cashHoldingId: holding.id, amount: '100.00', date: '2026-08-01' },
        { cashHoldingId: holding.id, amount: '150.00', date: '2026-09-01' },
      ]);

      await request(app.getHttpServer()).delete(`/cash-holdings/${holding.id}`).set('Authorization', auth(token)).expect(204);

      const remainingHoldings = await db.query.cashHoldings.findMany({ where: (h, { eq }) => eq(h.userId, user.id) });
      expect(remainingHoldings).toHaveLength(0);
      const remainingBalances = await db.query.cashBalances.findMany({ where: (b, { eq }) => eq(b.cashHoldingId, holding.id) });
      expect(remainingBalances).toHaveLength(0);
    });

    it('una ubicación ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [holding] = await db.insert(cashHoldings).values({ userId: owner.id, location: 'Cartera' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/cash-holdings/${holding.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.cashHoldings.findFirst({ where: (h, { eq }) => eq(h.id, holding.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
