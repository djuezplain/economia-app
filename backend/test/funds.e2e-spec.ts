import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { fundPurchases, fundValuations, funds, users } from '../src/db/schema/index.js';

describe('Fondos de inversión (e2e) — spec 021 H1', () => {
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
    await db.delete(fundValuations);
    await db.delete(fundPurchases);
    await db.delete(funds);
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

  describe('GET /funds', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/funds').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/funds').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo los fondos propios', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(funds).values([
        { userId: owner.id, custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' },
        { userId: other.id, custodyBank: 'DeGiro', fund: 'MSCI World' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/funds').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].fund).toBe('Vanguard Global Stock Index');
    });
  });

  describe('POST /funds', () => {
    it('crea un fondo', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/funds')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .expect(201);

      expect(res.body.custodyBank).toBe('MyInvestor');
      expect(res.body.fund).toBe('Vanguard Global Stock Index');
    });

    it('H1 criterio 2: el mismo fondo (banco custodia + fondo) dos veces → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/funds')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/funds')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .expect(409);
    });

    it('mismo banco custodia+fondo pero de otro usuario no choca (aislamiento)', async () => {
      const userA = await createUser('usuario-a@example.com');
      const userB = await createUser('usuario-b@example.com');
      const tokenA = await login(userA.email);
      const tokenB = await login(userB.email);

      await request(app.getHttpServer())
        .post('/funds')
        .set('Authorization', auth(tokenA))
        .send({ custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/funds')
        .set('Authorization', auth(tokenB))
        .send({ custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .expect(201);
    });

    it('sin banco custodia o sin fondo → 400', async () => {
      const user = await createUser('campos-obligatorios@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/funds')
        .set('Authorization', auth(token))
        .send({ custodyBank: 'MyInvestor' })
        .expect(400);
    });
  });

  describe('PATCH /funds/:id', () => {
    it('edita banco custodia y fondo', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [fund] = await db
        .insert(funds)
        .values({ userId: user.id, custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/funds/${fund.id}`)
        .set('Authorization', auth(token))
        .send({ custodyBank: 'DeGiro', fund: 'MSCI World' })
        .expect(200);

      expect(res.body.custodyBank).toBe('DeGiro');
      expect(res.body.fund).toBe('MSCI World');
    });

    it('editar hacia un duplicado de otro fondo propio → 409', async () => {
      const user = await createUser('editar-duplicado@example.com');
      const token = await login(user.email);
      await db.insert(funds).values({ userId: user.id, custodyBank: 'DeGiro', fund: 'MSCI World' });
      const [fund] = await db
        .insert(funds)
        .values({ userId: user.id, custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .returning();

      await request(app.getHttpServer())
        .patch(`/funds/${fund.id}`)
        .set('Authorization', auth(token))
        .send({ custodyBank: 'DeGiro', fund: 'MSCI World' })
        .expect(409);
    });

    it('un fondo ajeno → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [fund] = await db
        .insert(funds)
        .values({ userId: owner.id, custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/funds/${fund.id}`)
        .set('Authorization', auth(token))
        .send({ fund: 'Otro' })
        .expect(404);
    });
  });

  describe('DELETE /funds/:id', () => {
    it('H1 criterio 4: elimina el fondo y, en cascada, sus historiales de compras y valoraciones', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [fund] = await db
        .insert(funds)
        .values({ userId: user.id, custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .returning();
      await db.insert(fundPurchases).values({ fundId: fund.id, shareCount: '10.0000', purchasePrice: '28.50', date: '2026-09-01' });
      await db.insert(fundValuations).values({ fundId: fund.id, pricePerShare: '35.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/funds/${fund.id}`).set('Authorization', auth(token)).expect(204);

      const remainingFunds = await db.query.funds.findMany({ where: (f, { eq }) => eq(f.userId, user.id) });
      expect(remainingFunds).toHaveLength(0);
      const remainingPurchases = await db.query.fundPurchases.findMany({ where: (p, { eq }) => eq(p.fundId, fund.id) });
      expect(remainingPurchases).toHaveLength(0);
      const remainingValuations = await db.query.fundValuations.findMany({ where: (v, { eq }) => eq(v.fundId, fund.id) });
      expect(remainingValuations).toHaveLength(0);
    });

    it('un fondo ajeno → 404, sin borrarlo', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [fund] = await db
        .insert(funds)
        .values({ userId: owner.id, custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/funds/${fund.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.funds.findFirst({ where: (f, { eq }) => eq(f.id, fund.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
