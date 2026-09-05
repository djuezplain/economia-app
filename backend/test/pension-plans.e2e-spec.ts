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

describe('Fondo Pensiones (e2e) — spec 024 H1', () => {
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

  describe('GET /pension-plans', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/pension-plans').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/pension-plans').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo las posiciones propias', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(pensionPlans).values([
        { userId: owner.id, managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' },
        { userId: other.id, managingEntity: 'BBVA', plan: 'Plan Crecimiento' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/pension-plans').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].plan).toBe('Plan Futuro Sostenible');
    });
  });

  describe('POST /pension-plans', () => {
    it('crea una posición de plan de pensiones', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/pension-plans')
        .set('Authorization', auth(token))
        .send({ managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .expect(201);

      expect(res.body.managingEntity).toBe('Caixabank');
      expect(res.body.plan).toBe('Plan Futuro Sostenible');
    });

    it('H1 criterio 2: la misma posición (entidad gestora + plan) dos veces → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/pension-plans')
        .set('Authorization', auth(token))
        .send({ managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/pension-plans')
        .set('Authorization', auth(token))
        .send({ managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .expect(409);
    });

    it('misma entidad gestora+plan pero de otro usuario no choca (aislamiento)', async () => {
      const userA = await createUser('usuario-a@example.com');
      const userB = await createUser('usuario-b@example.com');
      const tokenA = await login(userA.email);
      const tokenB = await login(userB.email);

      await request(app.getHttpServer())
        .post('/pension-plans')
        .set('Authorization', auth(tokenA))
        .send({ managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/pension-plans')
        .set('Authorization', auth(tokenB))
        .send({ managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .expect(201);
    });

    it('sin entidad gestora o sin plan → 400', async () => {
      const user = await createUser('campos-obligatorios@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/pension-plans')
        .set('Authorization', auth(token))
        .send({ managingEntity: 'Caixabank' })
        .expect(400);
    });
  });

  describe('PATCH /pension-plans/:id', () => {
    it('edita entidad gestora y plan', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [plan] = await db
        .insert(pensionPlans)
        .values({ userId: user.id, managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/pension-plans/${plan.id}`)
        .set('Authorization', auth(token))
        .send({ managingEntity: 'BBVA', plan: 'Plan Crecimiento' })
        .expect(200);

      expect(res.body.managingEntity).toBe('BBVA');
      expect(res.body.plan).toBe('Plan Crecimiento');
    });

    it('editar hacia un duplicado de otra posición propia → 409', async () => {
      const user = await createUser('editar-duplicado@example.com');
      const token = await login(user.email);
      await db.insert(pensionPlans).values({ userId: user.id, managingEntity: 'BBVA', plan: 'Plan Crecimiento' });
      const [plan] = await db
        .insert(pensionPlans)
        .values({ userId: user.id, managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .returning();

      await request(app.getHttpServer())
        .patch(`/pension-plans/${plan.id}`)
        .set('Authorization', auth(token))
        .send({ managingEntity: 'BBVA', plan: 'Plan Crecimiento' })
        .expect(409);
    });

    it('una posición ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [plan] = await db
        .insert(pensionPlans)
        .values({ userId: owner.id, managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/pension-plans/${plan.id}`)
        .set('Authorization', auth(token))
        .send({ plan: 'Otro' })
        .expect(404);
    });
  });

  describe('DELETE /pension-plans/:id', () => {
    it('H1 criterio 4: elimina la posición y, en cascada, sus historiales de aportaciones y valoraciones', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [plan] = await db
        .insert(pensionPlans)
        .values({ userId: user.id, managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .returning();
      await db.insert(pensionPlanContributions).values({ pensionPlanId: plan.id, amount: '100.00', date: '2026-01-01' });
      await db.insert(pensionPlanValuations).values({ pensionPlanId: plan.id, value: '105.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/pension-plans/${plan.id}`).set('Authorization', auth(token)).expect(204);

      const remainingPlans = await db.query.pensionPlans.findMany({ where: (p, { eq }) => eq(p.userId, user.id) });
      expect(remainingPlans).toHaveLength(0);
      const remainingContributions = await db.query.pensionPlanContributions.findMany({
        where: (c, { eq }) => eq(c.pensionPlanId, plan.id),
      });
      expect(remainingContributions).toHaveLength(0);
      const remainingValuations = await db.query.pensionPlanValuations.findMany({
        where: (v, { eq }) => eq(v.pensionPlanId, plan.id),
      });
      expect(remainingValuations).toHaveLength(0);
    });

    it('una posición ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [plan] = await db
        .insert(pensionPlans)
        .values({ userId: owner.id, managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/pension-plans/${plan.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.pensionPlans.findFirst({ where: (p, { eq }) => eq(p.id, plan.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
