import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { categories, expenseBudgets, savingsGoals, transactions, users } from '../src/db/schema/index.js';

describe('Presupuestos de gasto (e2e) — spec 004 H2', () => {
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

  async function createCategory(
    userId: string,
    type: 'INCOME' | 'EXPENSE',
    name: string,
    parentId: string | null = null,
  ) {
    const [category] = await db.insert(categories).values({ userId, type, name, parentId }).returning();
    return category;
  }

  describe('GET /expense-budgets', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/expense-budgets').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/expense-budgets').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo los presupuestos propios', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(expenseBudgets).values([
        { userId: owner.id, categoryId: null, targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' },
        { userId: other.id, categoryId: null, targetType: 'AMOUNT', targetValue: '999.00', alertThresholdPercent: '80.00' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/expense-budgets').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].targetValue).toBe('500.00');
    });
  });

  describe('POST /expense-budgets', () => {
    it('crea un presupuesto global y uno por categoría a la vez, sin chocar entre sí', async () => {
      const user = await createUser('crear@example.com');
      const category = await createCategory(user.id, 'EXPENSE', 'Comida');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ targetType: 'AMOUNT', targetValue: '1000.00', alertThresholdPercent: '80.00' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ categoryId: category.id, targetType: 'AMOUNT', targetValue: '300.00', alertThresholdPercent: '90.00' })
        .expect(201);

      const budgets = await db.query.expenseBudgets.findMany({ where: (b, { eq }) => eq(b.userId, user.id) });
      expect(budgets).toHaveLength(2);
    });

    it('un segundo presupuesto global → 409', async () => {
      const user = await createUser('duplicado-global@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ targetType: 'AMOUNT', targetValue: '1000.00', alertThresholdPercent: '80.00' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ targetType: 'AMOUNT', targetValue: '1200.00', alertThresholdPercent: '80.00' })
        .expect(409);
    });

    it('un segundo presupuesto para la misma categoría → 409', async () => {
      const user = await createUser('duplicado-categoria@example.com');
      const category = await createCategory(user.id, 'EXPENSE', 'Comida');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ categoryId: category.id, targetType: 'AMOUNT', targetValue: '300.00', alertThresholdPercent: '80.00' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ categoryId: category.id, targetType: 'AMOUNT', targetValue: '350.00', alertThresholdPercent: '80.00' })
        .expect(409);
    });

    it('una subcategoría como categoryId → 400', async () => {
      const user = await createUser('subcategoria@example.com');
      const parent = await createCategory(user.id, 'EXPENSE', 'Comida');
      const sub = await createCategory(user.id, 'EXPENSE', 'Restaurantes', parent.id);
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ categoryId: sub.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' })
        .expect(400);
    });

    it('una categoría de tipo INCOME como categoryId → 400', async () => {
      const user = await createUser('income-categoria@example.com');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ categoryId: category.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' })
        .expect(400);
    });

    it('una categoryId ajena → 404', async () => {
      const owner = await createUser('propietaria-categoria@example.com');
      const other = await createUser('otro-categoria@example.com');
      const category = await createCategory(owner.id, 'EXPENSE', 'Comida');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ categoryId: category.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' })
        .expect(404);
    });

    it('una categoryId inexistente → 404', async () => {
      const user = await createUser('categoria-inexistente@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ categoryId: '00000000-0000-0000-0000-000000000000', targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' })
        .expect(404);
    });

    it('targetType PERCENT con targetValue > 100 → 400', async () => {
      const user = await createUser('percent-excesivo@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ targetType: 'PERCENT', targetValue: '150.00', alertThresholdPercent: '80.00' })
        .expect(400);
    });

    it('alertThresholdPercent > 100 → 400', async () => {
      const user = await createUser('umbral-excesivo@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/expense-budgets')
        .set('Authorization', auth(token))
        .send({ targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '150.00' })
        .expect(400);
    });
  });

  describe('PATCH /expense-budgets/:id', () => {
    it('edita targetType/targetValue/alertThresholdPercent', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [budget] = await db
        .insert(expenseBudgets)
        .values({ userId: user.id, categoryId: null, targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/expense-budgets/${budget.id}`)
        .set('Authorization', auth(token))
        .send({ targetValue: '600.00', alertThresholdPercent: '85.00' })
        .expect(200);

      expect(res.body.targetValue).toBe('600.00');
      expect(res.body.alertThresholdPercent).toBe('85.00');
    });

    it('un presupuesto ajeno → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [budget] = await db
        .insert(expenseBudgets)
        .values({ userId: owner.id, categoryId: null, targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/expense-budgets/${budget.id}`)
        .set('Authorization', auth(token))
        .send({ targetValue: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /expense-budgets/:id', () => {
    it('borra un presupuesto propio', async () => {
      const user = await createUser('borrar@example.com');
      const token = await login(user.email);
      const [budget] = await db
        .insert(expenseBudgets)
        .values({ userId: user.id, categoryId: null, targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();

      await request(app.getHttpServer()).delete(`/expense-budgets/${budget.id}`).set('Authorization', auth(token)).expect(204);

      const remaining = await db.query.expenseBudgets.findMany({ where: (b, { eq }) => eq(b.userId, user.id) });
      expect(remaining).toHaveLength(0);
    });

    it('un presupuesto ajeno → 404, sin borrar nada', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [budget] = await db
        .insert(expenseBudgets)
        .values({ userId: owner.id, categoryId: null, targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/expense-budgets/${budget.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.expenseBudgets.findFirst({ where: (b, { eq }) => eq(b.id, budget.id) });
      expect(stillThere).toBeDefined();
    });
  });

  describe('borrado en cascada de la categoría (plan.md §1: onDelete cascade)', () => {
    it('borrar la categoría asociada borra también su presupuesto', async () => {
      const user = await createUser('cascade@example.com');
      const category = await createCategory(user.id, 'EXPENSE', 'Comida');
      const [budget] = await db
        .insert(expenseBudgets)
        .values({ userId: user.id, categoryId: category.id, targetType: 'AMOUNT', targetValue: '300.00', alertThresholdPercent: '80.00' })
        .returning();

      await db.delete(categories).where(eq(categories.id, category.id));

      const remaining = await db.query.expenseBudgets.findFirst({ where: (b, { eq: eqOp }) => eqOp(b.id, budget.id) });
      expect(remaining).toBeUndefined();
    });
  });
});
