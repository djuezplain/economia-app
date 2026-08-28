import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { categories, expenseBudgets, savingsGoals, transactions, users } from '../src/db/schema/index.js';

describe('Objetivos de ahorro (e2e) — spec 004 H1', () => {
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
    await db.delete(transactions);
    await db.delete(expenseBudgets);
    await db.delete(savingsGoals);
    await db.delete(categories);
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

  describe('GET /savings-goals', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/savings-goals').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/savings-goals').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo los objetivos propios', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(savingsGoals).values([
        { userId: owner.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' },
        { userId: other.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '999.00', alertThresholdPercent: '80.00' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/savings-goals').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].targetValue).toBe('500.00');
    });
  });

  describe('POST /savings-goals', () => {
    it('crea un objetivo mensual y uno anual a la vez, sin chocar entre sí', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/savings-goals')
        .set('Authorization', auth(token))
        .send({ period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/savings-goals')
        .set('Authorization', auth(token))
        .send({ period: 'ANNUAL', targetType: 'PERCENT', targetValue: '20.00', alertThresholdPercent: '90.00' })
        .expect(201);

      const goals = await db.query.savingsGoals.findMany({ where: (g, { eq }) => eq(g.userId, user.id) });
      expect(goals).toHaveLength(2);
    });

    it('un segundo objetivo con el mismo period → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/savings-goals')
        .set('Authorization', auth(token))
        .send({ period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/savings-goals')
        .set('Authorization', auth(token))
        .send({ period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '600.00', alertThresholdPercent: '80.00' })
        .expect(409);
    });

    it('targetType PERCENT con targetValue > 100 → 400', async () => {
      const user = await createUser('percent-excesivo@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/savings-goals')
        .set('Authorization', auth(token))
        .send({ period: 'MONTHLY', targetType: 'PERCENT', targetValue: '150.00', alertThresholdPercent: '80.00' })
        .expect(400);
    });

    it('alertThresholdPercent > 100 → 400', async () => {
      const user = await createUser('umbral-excesivo@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/savings-goals')
        .set('Authorization', auth(token))
        .send({ period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '150.00' })
        .expect(400);
    });

    it('targetValue negativo o no numérico → 400', async () => {
      const user = await createUser('valor-invalido@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/savings-goals')
        .set('Authorization', auth(token))
        .send({ period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '-10.00', alertThresholdPercent: '80.00' })
        .expect(400);
    });
  });

  describe('PATCH /savings-goals/:id', () => {
    it('edita targetType/targetValue/alertThresholdPercent', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [goal] = await db
        .insert(savingsGoals)
        .values({ userId: user.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/savings-goals/${goal.id}`)
        .set('Authorization', auth(token))
        .send({ targetValue: '600.00', alertThresholdPercent: '85.00' })
        .expect(200);

      expect(res.body.targetValue).toBe('600.00');
      expect(res.body.alertThresholdPercent).toBe('85.00');
      expect(res.body.period).toBe('MONTHLY'); // no editable
    });

    it('un objetivo ajeno → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [goal] = await db
        .insert(savingsGoals)
        .values({ userId: owner.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/savings-goals/${goal.id}`)
        .set('Authorization', auth(token))
        .send({ targetValue: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /savings-goals/:id', () => {
    it('borra un objetivo propio', async () => {
      const user = await createUser('borrar@example.com');
      const token = await login(user.email);
      const [goal] = await db
        .insert(savingsGoals)
        .values({ userId: user.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();

      await request(app.getHttpServer()).delete(`/savings-goals/${goal.id}`).set('Authorization', auth(token)).expect(204);

      const remaining = await db.query.savingsGoals.findMany({ where: (g, { eq }) => eq(g.userId, user.id) });
      expect(remaining).toHaveLength(0);
    });

    it('un objetivo ajeno → 404, sin borrar nada', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [goal] = await db
        .insert(savingsGoals)
        .values({ userId: owner.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/savings-goals/${goal.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.savingsGoals.findFirst({ where: (g, { eq }) => eq(g.id, goal.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
