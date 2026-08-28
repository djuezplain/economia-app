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

describe('Progreso de objetivos y presupuestos (e2e) — spec 004 H3/H4', () => {
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

  async function createCategory(userId: string, type: 'INCOME' | 'EXPENSE', name: string) {
    const [category] = await db.insert(categories).values({ userId, type, name }).returning();
    return category;
  }

  // Mes cerrado (no coincide con "hoy" en ningún entorno realista de test):
  // permite comprobar `projectedAmount: null` de forma determinista.
  const CLOSED_MONTH = '2026-06';

  describe('GET /goals-progress/month', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/goals-progress/month').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/goals-progress/month').set('Authorization', auth(token)).expect(403);
    });

    it('sin ningún objetivo ni presupuesto definido, devuelve listas vacías (no error)', async () => {
      const user = await createUser('sin-nada@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.savingsGoal).toBeNull();
      expect(res.body.expenseBudgets).toEqual([]);
    });

    it('calcula el progreso de un objetivo de ahorro mensual y de un presupuesto por categoría en un mes cerrado (sin proyección)', async () => {
      const user = await createUser('progreso-cerrado@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const food = await createCategory(user.id, 'EXPENSE', 'Comida');
      await db.insert(transactions).values([
        { userId: user.id, type: 'INCOME', date: `${CLOSED_MONTH}-01`, categoryId: income.id, concept: 'Nómina', amount: '2000.00' },
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: food.id, concept: 'Súper', amount: '300.00' },
      ]);
      // Ahorro real = 2000 - 300 = 1700.
      await db.insert(savingsGoals).values({
        userId: user.id,
        period: 'MONTHLY',
        targetType: 'AMOUNT',
        targetValue: '500.00',
        alertThresholdPercent: '80.00',
      });
      await db.insert(expenseBudgets).values({
        userId: user.id,
        categoryId: food.id,
        targetType: 'AMOUNT',
        targetValue: '250.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.month).toBe(CLOSED_MONTH);
      expect(res.body.savingsGoal).toMatchObject({
        targetType: 'AMOUNT',
        targetValue: '500.00',
        actualAmount: '1700.00',
        targetAmount: '500.00',
        deviation: '1200.00',
        progressPercent: '340.00',
        status: 'AT_OR_ABOVE_TARGET',
        projectedAmount: null,
      });
      expect(res.body.expenseBudgets).toHaveLength(1);
      expect(res.body.expenseBudgets[0]).toMatchObject({
        categoryId: food.id,
        actualAmount: '300.00',
        targetAmount: '250.00',
        deviation: '50.00',
        progressPercent: '120.00',
        status: 'AT_OR_ABOVE_TARGET',
        projectedAmount: null,
      });
    });

    it('un presupuesto global usa el gasto total del mes, no solo el de una categoría', async () => {
      const user = await createUser('presupuesto-global@example.com');
      const foodCat = await createCategory(user.id, 'EXPENSE', 'Comida');
      const transportCat = await createCategory(user.id, 'EXPENSE', 'Transporte');
      await db.insert(transactions).values([
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: foodCat.id, concept: 'Súper', amount: '300.00' },
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-10`, categoryId: transportCat.id, concept: 'Bus', amount: '50.00' },
      ]);
      await db.insert(expenseBudgets).values({
        userId: user.id,
        categoryId: null,
        targetType: 'AMOUNT',
        targetValue: '1000.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.expenseBudgets[0]).toMatchObject({ categoryId: null, actualAmount: '350.00' });
    });

    it('un presupuesto de categoría sin ningún gasto todavía ese mes → actualAmount "0.00", progressPercent "0.00"', async () => {
      const user = await createUser('sin-gasto-aun@example.com');
      const category = await createCategory(user.id, 'EXPENSE', 'Ocio');
      await db.insert(expenseBudgets).values({
        userId: user.id,
        categoryId: category.id,
        targetType: 'AMOUNT',
        targetValue: '100.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.expenseBudgets[0]).toMatchObject({ actualAmount: '0.00', progressPercent: '0.00' });
    });

    it('objetivo PERCENT con ingresos = 0 en el periodo → targetAmount/progressPercent null, sin proyección, estado BELOW_THRESHOLD', async () => {
      const user = await createUser('percent-sin-ingresos@example.com');
      // Solo gasto, ningún ingreso ese mes.
      const category = await createCategory(user.id, 'EXPENSE', 'Comida');
      await db.insert(transactions).values({
        userId: user.id,
        type: 'EXPENSE',
        date: `${CLOSED_MONTH}-05`,
        categoryId: category.id,
        concept: 'Súper',
        amount: '100.00',
      });
      await db.insert(savingsGoals).values({
        userId: user.id,
        period: 'MONTHLY',
        targetType: 'PERCENT',
        targetValue: '20.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.savingsGoal).toMatchObject({
        targetAmount: null,
        progressPercent: null,
        status: 'BELOW_THRESHOLD',
        projectedAmount: null,
      });
    });

    it('H2 criterio 2 / plan.md §4: un presupuesto PERCENT calcula su importe objetivo sobre los ingresos reales del mes', async () => {
      const user = await createUser('presupuesto-percent@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const food = await createCategory(user.id, 'EXPENSE', 'Comida');
      await db.insert(transactions).values([
        { userId: user.id, type: 'INCOME', date: `${CLOSED_MONTH}-01`, categoryId: income.id, concept: 'Nómina', amount: '2000.00' },
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: food.id, concept: 'Súper', amount: '150.00' },
      ]);
      // Presupuesto: 10% de los ingresos → 200.00.
      await db.insert(expenseBudgets).values({
        userId: user.id,
        categoryId: food.id,
        targetType: 'PERCENT',
        targetValue: '10.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.expenseBudgets[0]).toMatchObject({ actualAmount: '150.00', targetAmount: '200.00', progressPercent: '75.00' });
    });

    it('§4: un presupuesto PERCENT con ingresos = 0 en el mes → targetAmount/progressPercent null, sin dividir por cero', async () => {
      const user = await createUser('presupuesto-percent-sin-ingresos@example.com');
      const food = await createCategory(user.id, 'EXPENSE', 'Comida');
      await db.insert(transactions).values({
        userId: user.id,
        type: 'EXPENSE',
        date: `${CLOSED_MONTH}-05`,
        categoryId: food.id,
        concept: 'Súper',
        amount: '100.00',
      });
      await db.insert(expenseBudgets).values({
        userId: user.id,
        categoryId: food.id,
        targetType: 'PERCENT',
        targetValue: '10.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.expenseBudgets[0]).toMatchObject({ targetAmount: null, progressPercent: null, status: 'BELOW_THRESHOLD' });
    });

    it('H1 criterio 2 / H2 criterio 3: el mismo objetivo y presupuesto, sin volver a crearlos, aplican a distintos meses con su propio real de cada uno', async () => {
      const user = await createUser('mismo-objetivo-varios-meses@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const food = await createCategory(user.id, 'EXPENSE', 'Comida');
      const OTHER_CLOSED_MONTH = '2026-07';
      await db.insert(transactions).values([
        { userId: user.id, type: 'INCOME', date: `${CLOSED_MONTH}-01`, categoryId: income.id, concept: 'Nómina junio', amount: '2000.00' },
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: food.id, concept: 'Súper junio', amount: '100.00' },
        { userId: user.id, type: 'INCOME', date: `${OTHER_CLOSED_MONTH}-01`, categoryId: income.id, concept: 'Nómina julio', amount: '2000.00' },
        { userId: user.id, type: 'EXPENSE', date: `${OTHER_CLOSED_MONTH}-05`, categoryId: food.id, concept: 'Súper julio', amount: '300.00' },
      ]);
      const [goal] = await db
        .insert(savingsGoals)
        .values({ userId: user.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' })
        .returning();
      const [budget] = await db
        .insert(expenseBudgets)
        .values({ userId: user.id, categoryId: food.id, targetType: 'AMOUNT', targetValue: '250.00', alertThresholdPercent: '80.00' })
        .returning();
      const token = await login(user.email);

      const juneRes = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);
      const julyRes = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${OTHER_CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      // Mismo objetivo/presupuesto (mismo id) en los dos meses, sin haberlo vuelto a crear; el "real" cambia con cada mes.
      expect(juneRes.body.savingsGoal.id).toBe(goal.id);
      expect(julyRes.body.savingsGoal.id).toBe(goal.id);
      expect(juneRes.body.savingsGoal.actualAmount).toBe('1900.00'); // 2000 - 100
      expect(julyRes.body.savingsGoal.actualAmount).toBe('1700.00'); // 2000 - 300

      expect(juneRes.body.expenseBudgets[0].id).toBe(budget.id);
      expect(julyRes.body.expenseBudgets[0].id).toBe(budget.id);
      expect(juneRes.body.expenseBudgets[0].actualAmount).toBe('100.00');
      expect(julyRes.body.expenseBudgets[0].actualAmount).toBe('300.00');
    });

    it('umbrales de aviso: 79% BELOW_THRESHOLD, 85% NEAR_THRESHOLD, 105% AT_OR_ABOVE_TARGET (umbral 80)', async () => {
      const user = await createUser('umbrales@example.com');
      const catBelow = await createCategory(user.id, 'EXPENSE', 'Bajo umbral');
      const catNear = await createCategory(user.id, 'EXPENSE', 'Cerca del umbral');
      const catOver = await createCategory(user.id, 'EXPENSE', 'Superado');
      await db.insert(transactions).values([
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: catBelow.id, concept: 'A', amount: '79.00' },
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: catNear.id, concept: 'B', amount: '85.00' },
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: catOver.id, concept: 'C', amount: '105.00' },
      ]);
      await db.insert(expenseBudgets).values([
        { userId: user.id, categoryId: catBelow.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' },
        { userId: user.id, categoryId: catNear.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' },
        { userId: user.id, categoryId: catOver.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      const byCategory = (id: string) => res.body.expenseBudgets.find((b: { categoryId: string }) => b.categoryId === id);
      expect(byCategory(catBelow.id).status).toBe('BELOW_THRESHOLD');
      expect(byCategory(catNear.id).status).toBe('NEAR_THRESHOLD');
      expect(byCategory(catOver.id).status).toBe('AT_OR_ABOVE_TARGET');
    });

    it('H4 criterio 1: el umbral de aviso es independiente por presupuesto — el mismo 85% de consumo da estados distintos con umbrales distintos', async () => {
      const user = await createUser('umbral-independiente@example.com');
      const catLowThreshold = await createCategory(user.id, 'EXPENSE', 'Umbral bajo');
      const catHighThreshold = await createCategory(user.id, 'EXPENSE', 'Umbral alto');
      await db.insert(transactions).values([
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: catLowThreshold.id, concept: 'A', amount: '85.00' },
        { userId: user.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: catHighThreshold.id, concept: 'B', amount: '85.00' },
      ]);
      await db.insert(expenseBudgets).values([
        { userId: user.id, categoryId: catLowThreshold.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '50.00' },
        { userId: user.id, categoryId: catHighThreshold.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '90.00' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      const byCategory = (id: string) => res.body.expenseBudgets.find((b: { categoryId: string }) => b.categoryId === id);
      // Mismo 85% de progreso en ambos, pero el umbral de cada uno decide el estado — no hay un umbral global compartido.
      expect(byCategory(catLowThreshold.id).status).toBe('NEAR_THRESHOLD'); // 85% >= umbral 50%
      expect(byCategory(catHighThreshold.id).status).toBe('BELOW_THRESHOLD'); // 85% < umbral 90%
    });

    it('el mes en curso calcula una proyección de cierre por extrapolación (no null)', async () => {
      const user = await createUser('mes-actual@example.com');
      const category = await createCategory(user.id, 'EXPENSE', 'Comida');
      const today = new Date();
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const todayIso = `${currentMonth}-${String(today.getDate()).padStart(2, '0')}`;
      await db.insert(transactions).values({
        userId: user.id,
        type: 'EXPENSE',
        date: todayIso,
        categoryId: category.id,
        concept: 'Súper',
        amount: '100.00',
      });
      await db.insert(expenseBudgets).values({
        userId: user.id,
        categoryId: category.id,
        targetType: 'AMOUNT',
        targetValue: '500.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/goals-progress/month')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.month).toBe(currentMonth);
      expect(res.body.expenseBudgets[0].projectedAmount).not.toBeNull();
    });

    it('aislamiento: nunca incluye objetivos/presupuestos/movimientos de otro usuario', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownCategory = await createCategory(owner.id, 'EXPENSE', 'Comida');
      const otherCategory = await createCategory(other.id, 'EXPENSE', 'Comida ajena');
      await db.insert(transactions).values([
        { userId: owner.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: ownCategory.id, concept: 'Propio', amount: '50.00' },
        { userId: other.id, type: 'EXPENSE', date: `${CLOSED_MONTH}-05`, categoryId: otherCategory.id, concept: 'Ajeno', amount: '9999.00' },
      ]);
      await db.insert(savingsGoals).values([
        { userId: owner.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '500.00', alertThresholdPercent: '80.00' },
        { userId: other.id, period: 'MONTHLY', targetType: 'AMOUNT', targetValue: '999.00', alertThresholdPercent: '80.00' },
      ]);
      await db.insert(expenseBudgets).values([
        { userId: owner.id, categoryId: ownCategory.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' },
        { userId: other.id, categoryId: otherCategory.id, targetType: 'AMOUNT', targetValue: '100.00', alertThresholdPercent: '80.00' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer())
        .get(`/goals-progress/month?month=${CLOSED_MONTH}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.savingsGoal.targetValue).toBe('500.00');
      expect(res.body.expenseBudgets).toHaveLength(1);
      expect(res.body.expenseBudgets[0].actualAmount).toBe('50.00');
    });
  });

  describe('GET /goals-progress/year', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/goals-progress/year').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar-year@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/goals-progress/year').set('Authorization', auth(token)).expect(403);
    });

    it('sin objetivo anual definido, devuelve savingsGoal: null (no error)', async () => {
      const user = await createUser('sin-anual@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/goals-progress/year?year=2026')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.savingsGoal).toBeNull();
    });

    it('calcula el progreso de un objetivo de ahorro anual en un año cerrado, sin proyección', async () => {
      const user = await createUser('anual-cerrado@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      await db.insert(transactions).values({
        userId: user.id,
        type: 'INCOME',
        date: '2025-03-01',
        categoryId: income.id,
        concept: 'Nómina',
        amount: '24000.00',
      });
      await db.insert(savingsGoals).values({
        userId: user.id,
        period: 'ANNUAL',
        targetType: 'AMOUNT',
        targetValue: '20000.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/goals-progress/year?year=2025')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.year).toBe(2025);
      expect(res.body.savingsGoal).toMatchObject({
        actualAmount: '24000.00',
        targetAmount: '20000.00',
        status: 'AT_OR_ABOVE_TARGET',
        projectedAmount: null,
      });
    });

    it('el año en curso calcula una proyección (no null)', async () => {
      const user = await createUser('anual-actual@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const currentYear = new Date().getFullYear();
      await db.insert(transactions).values({
        userId: user.id,
        type: 'INCOME',
        date: `${currentYear}-01-05`,
        categoryId: income.id,
        concept: 'Nómina',
        amount: '1000.00',
      });
      await db.insert(savingsGoals).values({
        userId: user.id,
        period: 'ANNUAL',
        targetType: 'AMOUNT',
        targetValue: '10000.00',
        alertThresholdPercent: '80.00',
      });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/goals-progress/year')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.year).toBe(currentYear);
      expect(res.body.savingsGoal.projectedAmount).not.toBeNull();
    });
  });
});
