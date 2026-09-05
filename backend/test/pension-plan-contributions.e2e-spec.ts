import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { pensionPlanContributions, pensionPlanValuations, pensionPlans, users } from '../src/db/schema/index.js';

describe('Historial de aportaciones a planes de pensiones (e2e) — spec 024 H2', () => {
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
    await db.delete(pensionPlanValuations);
    await db.delete(pensionPlanContributions);
    await db.delete(pensionPlans);
    await db.delete(users);
  });

  async function createUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    return user;
  }

  async function createPlan(userId: string, managingEntity: string, plan: string) {
    const [entity] = await db.insert(pensionPlans).values({ userId, managingEntity, plan }).returning();
    return entity;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /pension-plan-contributions', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/pension-plan-contributions').expect(401);
    });

    it('lista solo las aportaciones de posiciones propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerPlan = await createPlan(owner.id, 'Caixabank', 'Plan Futuro Sostenible');
      const otherPlan = await createPlan(other.id, 'BBVA', 'Plan Crecimiento');
      await db.insert(pensionPlanContributions).values([
        { pensionPlanId: ownerPlan.id, amount: '100.00', date: '2026-08-01' },
        { pensionPlanId: ownerPlan.id, amount: '150.00', date: '2026-09-01' },
        { pensionPlanId: otherPlan.id, amount: '200.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/pension-plan-contributions').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((c: { pensionPlanId: string }) => c.pensionPlanId === ownerPlan.id)).toBe(true);
    });
  });

  describe('POST /pension-plan-contributions', () => {
    it('crea una aportación en una posición propia', async () => {
      const user = await createUser('crear@example.com');
      const plan = await createPlan(user.id, 'Caixabank', 'Plan Futuro Sostenible');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/pension-plan-contributions')
        .set('Authorization', auth(token))
        .send({ pensionPlanId: plan.id, amount: '100.00', date: '2026-09-04' })
        .expect(201);

      expect(res.body.pensionPlanId).toBe(plan.id);
      expect(res.body.amount).toBe('100.00');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('H2 criterio 3: admite varias aportaciones en la misma posición, en fechas distintas', async () => {
      const user = await createUser('varias-aportaciones@example.com');
      const plan = await createPlan(user.id, 'Caixabank', 'Plan Futuro Sostenible');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/pension-plan-contributions')
        .set('Authorization', auth(token))
        .send({ pensionPlanId: plan.id, amount: '100.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/pension-plan-contributions')
        .set('Authorization', auth(token))
        .send({ pensionPlanId: plan.id, amount: '150.00', date: '2026-09-01' })
        .expect(201);

      const contributions = await db.query.pensionPlanContributions.findMany({ where: (c, { eq }) => eq(c.pensionPlanId, plan.id) });
      expect(contributions).toHaveLength(2);
    });

    it('H2 criterio 2: importe negativo o cero → 400', async () => {
      const user = await createUser('importe-invalido@example.com');
      const plan = await createPlan(user.id, 'Caixabank', 'Plan Futuro Sostenible');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/pension-plan-contributions')
        .set('Authorization', auth(token))
        .send({ pensionPlanId: plan.id, amount: '-100.00', date: '2026-09-04' })
        .expect(400);
    });

    it('H2 criterio 6: crear una aportación sobre una posición ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerPlan = await createPlan(owner.id, 'Caixabank', 'Plan Futuro Sostenible');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/pension-plan-contributions')
        .set('Authorization', auth(token))
        .send({ pensionPlanId: ownerPlan.id, amount: '100.00', date: '2026-09-04' })
        .expect(404);
    });

    it('importe no numérico → 400', async () => {
      const user = await createUser('importe-no-numerico@example.com');
      const plan = await createPlan(user.id, 'Caixabank', 'Plan Futuro Sostenible');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/pension-plan-contributions')
        .set('Authorization', auth(token))
        .send({ pensionPlanId: plan.id, amount: 'abc', date: '2026-09-04' })
        .expect(400);
    });
  });

  describe('PATCH /pension-plan-contributions/:id', () => {
    it('edita importe y fecha', async () => {
      const user = await createUser('editar@example.com');
      const plan = await createPlan(user.id, 'Caixabank', 'Plan Futuro Sostenible');
      const token = await login(user.email);
      const [contribution] = await db
        .insert(pensionPlanContributions)
        .values({ pensionPlanId: plan.id, amount: '100.00', date: '2026-08-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/pension-plan-contributions/${contribution.id}`)
        .set('Authorization', auth(token))
        .send({ amount: '120.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.amount).toBe('120.00');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('una aportación de una posición ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const plan = await createPlan(owner.id, 'Caixabank', 'Plan Futuro Sostenible');
      const [contribution] = await db
        .insert(pensionPlanContributions)
        .values({ pensionPlanId: plan.id, amount: '100.00', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/pension-plan-contributions/${contribution.id}`)
        .set('Authorization', auth(token))
        .send({ amount: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /pension-plan-contributions/:id', () => {
    it('elimina una aportación, sin afectar a la posición ni a las demás aportaciones', async () => {
      const user = await createUser('eliminar@example.com');
      const plan = await createPlan(user.id, 'Caixabank', 'Plan Futuro Sostenible');
      const token = await login(user.email);
      const [contributionA] = await db
        .insert(pensionPlanContributions)
        .values({ pensionPlanId: plan.id, amount: '100.00', date: '2026-08-01' })
        .returning();
      await db.insert(pensionPlanContributions).values({ pensionPlanId: plan.id, amount: '150.00', date: '2026-09-01' });

      await request(app.getHttpServer())
        .delete(`/pension-plan-contributions/${contributionA.id}`)
        .set('Authorization', auth(token))
        .expect(204);

      const remainingContributions = await db.query.pensionPlanContributions.findMany({
        where: (c, { eq }) => eq(c.pensionPlanId, plan.id),
      });
      expect(remainingContributions).toHaveLength(1);
      const stillTherePlan = await db.query.pensionPlans.findFirst({ where: (p, { eq }) => eq(p.id, plan.id) });
      expect(stillTherePlan).toBeDefined();
    });

    it('una aportación de una posición ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const plan = await createPlan(owner.id, 'Caixabank', 'Plan Futuro Sostenible');
      const [contribution] = await db
        .insert(pensionPlanContributions)
        .values({ pensionPlanId: plan.id, amount: '100.00', date: '2026-08-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .delete(`/pension-plan-contributions/${contribution.id}`)
        .set('Authorization', auth(token))
        .expect(404);

      const stillThere = await db.query.pensionPlanContributions.findFirst({ where: (c, { eq }) => eq(c.id, contribution.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
