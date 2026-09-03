import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { categories, transactions, users } from '../src/db/schema/index.js';
import { DashboardService } from '../src/dashboard/dashboard.service.js';

describe('Dashboard (e2e) — spec 002 H4/H5', () => {
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
    await db.delete(categories);
    await db.delete(users);
  });

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  async function createCategory(userId: string, type: 'INCOME' | 'EXPENSE', name: string) {
    const [category] = await db.insert(categories).values({ userId, type, name }).returning();
    return category;
  }

  describe('GET /dashboard/month', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/dashboard/month').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar-mes@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);

      await request(app.getHttpServer()).get('/dashboard/month').set('Authorization', auth(token)).expect(403);
    });

    it('calcula totales, ahorro, % de ahorro y desglose de gastos por categoría de un mes indicado', async () => {
      const user = await createUser('dashboard-mes@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const expenseA = await createCategory(user.id, 'EXPENSE', 'Comida');
      const expenseB = await createCategory(user.id, 'EXPENSE', 'Transporte');

      await db.insert(transactions).values([
        { userId: user.id, type: 'INCOME', date: '2026-06-01', categoryId: income.id, concept: 'Nómina junio', amount: '2000.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-06-05', categoryId: expenseA.id, concept: 'Súper', amount: '300.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-06-10', categoryId: expenseB.id, concept: 'Bus', amount: '50.00' },
        // Fuera del mes consultado — no debe contar.
        { userId: user.id, type: 'INCOME', date: '2026-07-01', categoryId: income.id, concept: 'Nómina julio', amount: '2000.00' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/dashboard/month?month=2026-06')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.month).toBe('2026-06');
      expect(res.body.income).toBe('2000.00');
      expect(res.body.expense).toBe('350.00');
      expect(res.body.savings).toBe('1650.00');
      expect(res.body.savingsPercent).toBe('82.50');
      expect(res.body.byCategory).toContainEqual({ categoryId: expenseA.id, total: '300.00' });
      expect(res.body.byCategory).toContainEqual({ categoryId: expenseB.id, total: '50.00' });
      // Junio de 2026 ya está cerrado: la media diaria divide por los 30 días del mes.
      expect(res.body.dailyAverages.income).toBe('66.67');
      expect(res.body.dailyAverages.expense).toBe('11.67');
      expect(res.body.dailyAverages.savings).toBe('55.00');
    });

    it('con ingresos = 0 en el mes, el % de ahorro es null, no un error ni una división por cero', async () => {
      const user = await createUser('sin-ingresos@example.com');
      const expenseA = await createCategory(user.id, 'EXPENSE', 'Comida');
      await db
        .insert(transactions)
        .values({ userId: user.id, type: 'EXPENSE', date: '2026-06-05', categoryId: expenseA.id, concept: 'Súper', amount: '50.00' });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/dashboard/month?month=2026-06')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.income).toBe('0.00');
      expect(res.body.savingsPercent).toBeNull();
    });

    it('un mes sin ningún movimiento devuelve 200 con todo a 0, no un 404', async () => {
      const user = await createUser('mes-vacio@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/dashboard/month?month=2026-06')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.income).toBe('0.00');
      expect(res.body.expense).toBe('0.00');
      expect(res.body.savings).toBe('0.00');
      expect(res.body.savingsPercent).toBeNull();
      expect(res.body.byCategory).toEqual([]);
    });

    it('sin `month`, usa el mes en curso', async () => {
      const user = await createUser('mes-actual@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/dashboard/month').set('Authorization', auth(token)).expect(200);

      const today = new Date();
      const expectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      expect(res.body.month).toBe(expectedMonth);
    });

    it('en el mes en curso, la media diaria divide por los días transcurridos, no por el mes completo', async () => {
      const user = await createUser('mes-en-curso-medias@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);
      await db
        .insert(transactions)
        .values({ userId: user.id, type: 'INCOME', date: todayIso, categoryId: income.id, concept: 'Ingreso de hoy', amount: '100.00' });
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/dashboard/month').set('Authorization', auth(token)).expect(200);

      // Con un único ingreso de "hoy" fechado hoy mismo, el total (100.00) dividido
      // entre los días transcurridos del mes (el día del mes de hoy) debe coincidir
      // con la media — nunca con el total de días del mes completo (que solo aplica
      // a un mes ya cerrado, ver `dashboard.calculations.spec.ts`).
      const expectedAverage = (100 / today.getDate()).toFixed(2);
      expect(res.body.dailyAverages.income).toBe(expectedAverage);
    });

    it('rechaza (400) un formato de `month` inválido', async () => {
      const user = await createUser('mes-invalido@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .get('/dashboard/month?month=2026-13')
        .set('Authorization', auth(token))
        .expect(400);
    });

    it('solo calcula sobre los movimientos propios del usuario autenticado', async () => {
      const owner = await createUser('dashboard-dueno@example.com');
      const other = await createUser('dashboard-otro@example.com');
      const ownerIncome = await createCategory(owner.id, 'INCOME', 'Nómina');
      const otherIncome = await createCategory(other.id, 'INCOME', 'Nómina ajena');

      await db.insert(transactions).values([
        { userId: owner.id, type: 'INCOME', date: '2026-06-01', categoryId: ownerIncome.id, concept: 'Propio', amount: '1000.00' },
        { userId: other.id, type: 'INCOME', date: '2026-06-01', categoryId: otherIncome.id, concept: 'Ajeno', amount: '9999.00' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer())
        .get('/dashboard/month?month=2026-06')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.income).toBe('1000.00');
    });
  });

  describe('GET /dashboard/year', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/dashboard/year').expect(401);
    });

    it('devuelve la evolución de los 12 meses del año y los acumulados anuales', async () => {
      const user = await createUser('dashboard-anio@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const expense = await createCategory(user.id, 'EXPENSE', 'Comida');

      await db.insert(transactions).values([
        { userId: user.id, type: 'INCOME', date: '2026-01-01', categoryId: income.id, concept: 'Nómina enero', amount: '2000.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-01-10', categoryId: expense.id, concept: 'Súper', amount: '300.00' },
        { userId: user.id, type: 'INCOME', date: '2026-03-01', categoryId: income.id, concept: 'Nómina marzo', amount: '2100.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-03-10', categoryId: expense.id, concept: 'Súper', amount: '400.00' },
        // Fuera del año consultado — no debe contar.
        { userId: user.id, type: 'INCOME', date: '2025-12-31', categoryId: income.id, concept: 'Año anterior', amount: '500.00' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/dashboard/year?year=2026')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.year).toBe(2026);
      expect(res.body.months).toHaveLength(12);
      expect(res.body.months[0]).toEqual({ month: '2026-01', income: '2000.00', expense: '300.00', savings: '1700.00' });
      expect(res.body.months[1]).toEqual({ month: '2026-02', income: '0.00', expense: '0.00', savings: '0.00' });
      expect(res.body.months[2]).toEqual({ month: '2026-03', income: '2100.00', expense: '400.00', savings: '1700.00' });

      expect(res.body.totals.income).toBe('4100.00');
      expect(res.body.totals.expense).toBe('700.00');
      expect(res.body.totals.savings).toBe('3400.00');
      expect(res.body.totals.savingsPercent).toBe('82.93');
    });

    it('un año sin ningún movimiento devuelve 200 con las 12 entradas a 0, no un 404', async () => {
      const user = await createUser('anio-vacio@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/dashboard/year?year=2026')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.months).toHaveLength(12);
      expect(res.body.months.every((m: { income: string }) => m.income === '0.00')).toBe(true);
      expect(res.body.totals.savingsPercent).toBeNull();
    });

    it('sin `year`, usa el año en curso', async () => {
      const user = await createUser('anio-actual@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/dashboard/year').set('Authorization', auth(token)).expect(200);

      expect(res.body.year).toBe(new Date().getFullYear());
    });

    it('rechaza (400) un formato de `year` inválido', async () => {
      const user = await createUser('anio-invalido@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .get('/dashboard/year?year=26')
        .set('Authorization', auth(token))
        .expect(400);
    });
  });

  describe('GET /dashboard/comparison (spec 013)', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/dashboard/comparison').expect(401);
    });

    it('rechaza (400) un `period` o `type` no soportado', async () => {
      const user = await createUser('comparativa-invalida@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .get('/dashboard/comparison?period=lustro')
        .set('Authorization', auth(token))
        .expect(400);
      await request(app.getHttpServer())
        .get('/dashboard/comparison?type=AHORRO')
        .set('Authorization', auth(token))
        .expect(400);
    });

    it('sin `period`/`type`, usa mes/gastos por defecto', async () => {
      const user = await createUser('comparativa-defecto@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/dashboard/comparison')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.period).toBe('month');
      expect(res.body.type).toBe('EXPENSE');
    });

    it('compara los gastos de un mes cerrado con el mes anterior (fechas fijas, no depende de "hoy")', async () => {
      const user = await createUser('comparativa-mes@example.com');
      const expense = await createCategory(user.id, 'EXPENSE', 'Comida');

      await db.insert(transactions).values([
        // Agosto de 2026 (mes que se consulta como "actual"): 2 gastos, 100.00 en total.
        { userId: user.id, type: 'EXPENSE', date: '2026-08-05', categoryId: expense.id, concept: 'Súper', amount: '60.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-08-10', categoryId: expense.id, concept: 'Restaurante', amount: '40.00' },
        // Julio de 2026 (mes anterior): 1 gasto, 50.00.
        { userId: user.id, type: 'EXPENSE', date: '2026-07-05', categoryId: expense.id, concept: 'Súper', amount: '50.00' },
        // Fuera de ambos meses — no debe contar.
        { userId: user.id, type: 'EXPENSE', date: '2026-06-01', categoryId: expense.id, concept: 'Fuera de rango', amount: '999.00' },
      ]);
      const token = await login(user.email);

      // spec 013, plan.md §2: el servicio compara el mes que contiene "ahora"
      // frente al anterior — se fija la fecha vía el parámetro `now` en el
      // servicio directamente, ya que el endpoint no acepta una fecha de
      // referencia (compara siempre contra "hoy", como `/dashboard/month`
      // hace con "sin `month`, usa el mes en curso"). Aquí se prueba a
      // través del servicio inyectado en vez del endpoint HTTP para poder
      // fijar `now` de forma determinista.
      const dashboardService = app.get(DashboardService);
      const res = await dashboardService.comparison(user.id, 'month', 'EXPENSE', new Date('2026-08-31T10:00:00.000Z'));

      expect(res.currentLabel).toBe('Agosto 2026');
      expect(res.previousLabel).toBe('Julio 2026');
      expect(res.days).toBe(31);
      expect(res.current).toEqual({ count: 2, total: '100.00', averagePerDay: '3.23' });
      expect(res.previous).toEqual({ count: 1, total: '50.00', averagePerDay: '1.61' });
      expect(res.changes.count).toBe('100.00');
      expect(res.changes.total).toBe('100.00');
    });

    it('si el periodo anterior no tiene movimientos, `changes` es null en vez de un % erróneo', async () => {
      const user = await createUser('comparativa-sin-anterior@example.com');
      const expense = await createCategory(user.id, 'EXPENSE', 'Comida');
      await db
        .insert(transactions)
        .values({ userId: user.id, type: 'EXPENSE', date: '2026-08-05', categoryId: expense.id, concept: 'Súper', amount: '60.00' });

      const dashboardService = app.get(DashboardService);
      const res = await dashboardService.comparison(user.id, 'month', 'EXPENSE', new Date('2026-08-31T10:00:00.000Z'));

      expect(res.previous).toEqual({ count: 0, total: '0.00', averagePerDay: '0.00' });
      expect(res.changes).toEqual({ count: null, total: null, averagePerDay: null });
    });

    it('solo calcula sobre los movimientos propios del usuario autenticado', async () => {
      const owner = await createUser('comparativa-dueno@example.com');
      const other = await createUser('comparativa-otro@example.com');
      const ownerExpense = await createCategory(owner.id, 'EXPENSE', 'Comida');
      const otherExpense = await createCategory(other.id, 'EXPENSE', 'Comida ajena');

      await db.insert(transactions).values([
        { userId: owner.id, type: 'EXPENSE', date: '2026-08-05', categoryId: ownerExpense.id, concept: 'Propio', amount: '10.00' },
        { userId: other.id, type: 'EXPENSE', date: '2026-08-05', categoryId: otherExpense.id, concept: 'Ajeno', amount: '9999.00' },
      ]);

      const dashboardService = app.get(DashboardService);
      const res = await dashboardService.comparison(owner.id, 'month', 'EXPENSE', new Date('2026-08-31T10:00:00.000Z'));

      expect(res.current.total).toBe('10.00');
    });

    it('separa gastos de ingresos según `type`', async () => {
      const user = await createUser('comparativa-tipo@example.com');
      const income = await createCategory(user.id, 'INCOME', 'Nómina');
      const expense = await createCategory(user.id, 'EXPENSE', 'Comida');

      await db.insert(transactions).values([
        { userId: user.id, type: 'INCOME', date: '2026-08-05', categoryId: income.id, concept: 'Nómina', amount: '2000.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-08-05', categoryId: expense.id, concept: 'Súper', amount: '60.00' },
      ]);

      const dashboardService = app.get(DashboardService);
      const expenseRes = await dashboardService.comparison(user.id, 'month', 'EXPENSE', new Date('2026-08-31T10:00:00.000Z'));
      const incomeRes = await dashboardService.comparison(user.id, 'month', 'INCOME', new Date('2026-08-31T10:00:00.000Z'));

      expect(expenseRes.current.total).toBe('60.00');
      expect(incomeRes.current.total).toBe('2000.00');
    });
  });

  describe('GET /dashboard/seasonal (spec 014)', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/dashboard/seasonal').expect(401);
    });

    it('rechaza (400) `scope=year` sin `year`, y un `year` con formato inválido', async () => {
      const user = await createUser('estacional-invalido@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .get('/dashboard/seasonal?scope=year')
        .set('Authorization', auth(token))
        .expect(400);
      await request(app.getHttpServer())
        .get('/dashboard/seasonal?scope=year&year=26')
        .set('Authorization', auth(token))
        .expect(400);
    });

    it('sin `type`/`scope`, usa gastos/histórico por defecto', async () => {
      const user = await createUser('estacional-defecto@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get('/dashboard/seasonal')
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.type).toBe('EXPENSE');
      expect(res.body.scope).toBe('historic');
      expect(res.body.year).toBeNull();
      expect(res.body.seasons).toHaveLength(4);
      expect(res.body.seasons.map((s: { season: string }) => s.season)).toEqual(['winter', 'spring', 'summer', 'autumn']);
    });

    it('alcance "año": reparte los movimientos de ese año natural por estación, con fechas fijas', async () => {
      const user = await createUser('estacional-anio@example.com');
      const expense = await createCategory(user.id, 'EXPENSE', 'Comida');

      await db.insert(transactions).values([
        { userId: user.id, type: 'EXPENSE', date: '2026-01-10', categoryId: expense.id, concept: 'Invierno 1', amount: '100.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-02-05', categoryId: expense.id, concept: 'Invierno 2', amount: '50.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-04-01', categoryId: expense.id, concept: 'Primavera', amount: '30.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-07-01', categoryId: expense.id, concept: 'Verano 1', amount: '200.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-08-15', categoryId: expense.id, concept: 'Verano 2', amount: '100.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-09-01', categoryId: expense.id, concept: 'Otoño', amount: '10.00' },
        // Fuera del año consultado — no debe contar.
        { userId: user.id, type: 'EXPENSE', date: '2025-01-05', categoryId: expense.id, concept: 'Año anterior', amount: '9999.00' },
      ]);

      const dashboardService = app.get(DashboardService);
      const res = await dashboardService.seasonal(user.id, 'EXPENSE', 'year', '2026', new Date('2026-09-03T10:00:00.000Z'));

      expect(res.seasons).toEqual([
        { season: 'winter', count: 2, total: '150.00', averagePerDay: '2.54' },
        { season: 'spring', count: 1, total: '30.00', averagePerDay: '0.33' },
        { season: 'summer', count: 2, total: '300.00', averagePerDay: '3.26' },
        { season: 'autumn', count: 1, total: '10.00', averagePerDay: '3.33' },
      ]);
      expect(res.comparison).toEqual({ bestSeason: 'summer', worstSeason: 'autumn', difference: '290.00', percent: '2900.00' });
    });

    it('alcance "histórico": suma movimientos de la misma estación en años distintos', async () => {
      const user = await createUser('estacional-historico@example.com');
      const expense = await createCategory(user.id, 'EXPENSE', 'Comida');

      await db.insert(transactions).values([
        { userId: user.id, type: 'EXPENSE', date: '2025-07-20', categoryId: expense.id, concept: 'Verano 2025', amount: '80.00' },
        { userId: user.id, type: 'EXPENSE', date: '2026-07-01', categoryId: expense.id, concept: 'Verano 2026', amount: '200.00' },
      ]);

      const dashboardService = app.get(DashboardService);
      const res = await dashboardService.seasonal(user.id, 'EXPENSE', 'historic', undefined, new Date('2026-08-28T10:00:00.000Z'));

      const summer = res.seasons.find((s) => s.season === 'summer');
      expect(summer).toMatchObject({ count: 2, total: '280.00' });
    });

    it('si como mucho una estación tiene movimientos, no hay comparación posible', async () => {
      const user = await createUser('estacional-sin-comparacion@example.com');
      const expense = await createCategory(user.id, 'EXPENSE', 'Comida');
      await db
        .insert(transactions)
        .values({ userId: user.id, type: 'EXPENSE', date: '2026-01-10', categoryId: expense.id, concept: 'Invierno', amount: '50.00' });

      const dashboardService = app.get(DashboardService);
      const res = await dashboardService.seasonal(user.id, 'EXPENSE', 'year', '2026', new Date('2026-09-03T10:00:00.000Z'));

      expect(res.comparison).toBeNull();
    });

    it('solo calcula sobre los movimientos propios del usuario autenticado', async () => {
      const owner = await createUser('estacional-dueno@example.com');
      const other = await createUser('estacional-otro@example.com');
      const ownerExpense = await createCategory(owner.id, 'EXPENSE', 'Comida');
      const otherExpense = await createCategory(other.id, 'EXPENSE', 'Comida ajena');

      await db.insert(transactions).values([
        { userId: owner.id, type: 'EXPENSE', date: '2026-07-01', categoryId: ownerExpense.id, concept: 'Propio', amount: '10.00' },
        { userId: other.id, type: 'EXPENSE', date: '2026-07-01', categoryId: otherExpense.id, concept: 'Ajeno', amount: '9999.00' },
      ]);

      const dashboardService = app.get(DashboardService);
      const res = await dashboardService.seasonal(owner.id, 'EXPENSE', 'year', '2026', new Date('2026-09-03T10:00:00.000Z'));

      expect(res.seasons.find((s) => s.season === 'summer')?.total).toBe('10.00');
    });
  });
});
