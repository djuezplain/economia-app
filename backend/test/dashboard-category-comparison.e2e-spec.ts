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

/**
 * Spec 015 (categorías con comparativa de periodo). Fichero nuevo, aparte
 * de `dashboard.e2e-spec.ts` (ya tiene 500 líneas) — plan.md §3.
 */
describe('Dashboard — GET /dashboard/category-comparison (spec 015)', () => {
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

  async function createUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
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

  it('sin autenticar, responde 401', async () => {
    await request(app.getHttpServer()).get('/dashboard/category-comparison').expect(401);
  });

  it('rechaza (400) un `period` no soportado (semana/trimestre no son válidos aquí)', async () => {
    const user = await createUser('categorias-invalido@example.com');
    const token = await login(user.email);

    await request(app.getHttpServer())
      .get('/dashboard/category-comparison?period=week')
      .set('Authorization', auth(token))
      .expect(400);
    await request(app.getHttpServer())
      .get('/dashboard/category-comparison?type=AHORRO')
      .set('Authorization', auth(token))
      .expect(400);
  });

  it('sin `period`/`type`, usa mes/gastos por defecto', async () => {
    const user = await createUser('categorias-defecto@example.com');
    const token = await login(user.email);

    const res = await request(app.getHttpServer())
      .get('/dashboard/category-comparison')
      .set('Authorization', auth(token))
      .expect(200);

    expect(res.body.period).toBe('month');
    expect(res.body.type).toBe('EXPENSE');
  });

  it('desglosa por categoría un mes cerrado frente al mes anterior, con la variación de cada una (fechas fijas)', async () => {
    const user = await createUser('categorias-mes@example.com');
    const food = await createCategory(user.id, 'EXPENSE', 'Comida');
    const transport = await createCategory(user.id, 'EXPENSE', 'Transporte');
    const leisure = await createCategory(user.id, 'EXPENSE', 'Ocio');

    await db.insert(transactions).values([
      // Agosto de 2026 (mes "actual"): Comida sube, Transporte es nueva (nada en julio).
      { userId: user.id, type: 'EXPENSE', date: '2026-08-05', categoryId: food.id, concept: 'Súper', amount: '60.00' },
      { userId: user.id, type: 'EXPENSE', date: '2026-08-10', categoryId: food.id, concept: 'Restaurante', amount: '40.00' },
      { userId: user.id, type: 'EXPENSE', date: '2026-08-15', categoryId: transport.id, concept: 'Bus', amount: '30.00' },
      // Julio de 2026 (mes anterior): Comida (base de la subida) y Ocio (sin movimientos en agosto — no debe aparecer en la respuesta).
      { userId: user.id, type: 'EXPENSE', date: '2026-07-05', categoryId: food.id, concept: 'Súper', amount: '50.00' },
      { userId: user.id, type: 'EXPENSE', date: '2026-07-20', categoryId: leisure.id, concept: 'Cine', amount: '20.00' },
      // Fuera de ambos meses — no debe contar.
      { userId: user.id, type: 'EXPENSE', date: '2026-06-01', categoryId: food.id, concept: 'Fuera de rango', amount: '999.00' },
    ]);

    // El endpoint compara siempre contra "hoy" (sin fecha de referencia
    // aceptada por query) — se fija `now` a través del servicio inyectado,
    // igual que ya hacen los tests de spec 013/014 con `comparison`/`seasonal`.
    const dashboardService = app.get(DashboardService);
    const res = await dashboardService.categoryComparison(user.id, 'month', 'EXPENSE', new Date('2026-08-31T10:00:00.000Z'));

    expect(res.currentLabel).toBe('Agosto 2026');
    expect(res.previousLabel).toBe('Julio 2026');
    expect(res.days).toBe(31);
    expect(res.periodTotal).toBe('130.00');
    // Incluye a Ocio (20.00), aunque Ocio no tenga movimientos en agosto y por tanto no aparezca en `categories`.
    expect(res.previousPeriodTotal).toBe('70.00');
    expect(res.categories).toEqual([
      { categoryId: food.id, total: '100.00', previousTotal: '50.00', change: '100.00' },
      { categoryId: transport.id, total: '30.00', previousTotal: '0.00', change: null },
    ]);
  });

  it('solo calcula sobre los movimientos propios del usuario autenticado', async () => {
    const owner = await createUser('categorias-dueno@example.com');
    const other = await createUser('categorias-otro@example.com');
    const ownerExpense = await createCategory(owner.id, 'EXPENSE', 'Comida');
    const otherExpense = await createCategory(other.id, 'EXPENSE', 'Comida ajena');

    await db.insert(transactions).values([
      { userId: owner.id, type: 'EXPENSE', date: '2026-08-05', categoryId: ownerExpense.id, concept: 'Propio', amount: '10.00' },
      { userId: other.id, type: 'EXPENSE', date: '2026-08-05', categoryId: otherExpense.id, concept: 'Ajeno', amount: '9999.00' },
    ]);

    const dashboardService = app.get(DashboardService);
    const res = await dashboardService.categoryComparison(owner.id, 'month', 'EXPENSE', new Date('2026-08-31T10:00:00.000Z'));

    expect(res.categories).toEqual([{ categoryId: ownerExpense.id, total: '10.00', previousTotal: '0.00', change: null }]);
  });
});
