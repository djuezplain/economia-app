import { randomUUID } from 'node:crypto';
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
import { categories, transactions, users } from '../src/db/schema/index.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';

describe('Movimientos (e2e) — spec 002 H1/H2', () => {
  let app: INestApplication<App>;
  let db: Database;
  let rateLimitGuard: RateLimitGuard;

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
    rateLimitGuard = moduleFixture.get<RateLimitGuard>(RateLimitGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(transactions);
    await db.delete(categories);
    await db.delete(users);
    // Este fichero ya hace más de 20 `login()` (el límite real de
    // `POST /auth/login`, 20 cada 15 min) — sin resetear el bucket en
    // memoria del guard entre tests, los últimos de la suite empezarían a
    // fallar con 429 sin que su propio test hiciera nada mal (ver comentario
    // de `RateLimitGuard.resetForTests`).
    rateLimitGuard.resetForTests();
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

  async function createCategory(userId: string, type: 'INCOME' | 'EXPENSE', name: string, parentId?: string) {
    const [category] = await db
      .insert(categories)
      .values({ userId, type, name, parentId: parentId ?? null })
      .returning();
    return category;
  }

  describe('POST /transactions', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).post('/transactions').send({}).expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({ type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'Nómina agosto', amount: '2000.00' })
        .expect(403);
    });

    it('crea un ingreso válido, con mes/año derivados de la fecha', async () => {
      const user = await createUser('crear-ingreso@example.com');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({ type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'Nómina agosto', amount: '2000.00' })
        .expect(201);

      expect(res.body).toMatchObject({
        type: 'INCOME',
        date: '2026-08-01',
        categoryId: category.id,
        concept: 'Nómina agosto',
        amount: '2000.00',
        merchant: null,
        subcategoryId: null,
        paymentMethod: null,
      });
    });

    it('crea un gasto válido con subcategoría, comercio y tipo de pago', async () => {
      const user = await createUser('crear-gasto@example.com');
      const parent = await createCategory(user.id, 'EXPENSE', 'Transporte');
      const child = await createCategory(user.id, 'EXPENSE', 'Gasolina', parent.id);
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({
          type: 'EXPENSE',
          date: '2026-08-05',
          categoryId: parent.id,
          subcategoryId: child.id,
          concept: 'Depósito lleno',
          merchant: 'Repsol',
          amount: '65.30',
          paymentMethod: 'CARD',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        subcategoryId: child.id,
        merchant: 'Repsol',
        paymentMethod: 'CARD',
        amount: '65.30',
      });
    });

    it('rechaza (400) un ingreso con campos exclusivos de gasto', async () => {
      const user = await createUser('ingreso-con-gasto@example.com');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({ type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'x', amount: '10.00', merchant: 'No debería aceptarse' })
        .expect(400);
    });

    it('rechaza (400) una subcategoría que no es hija de la categoría indicada', async () => {
      const user = await createUser('subcategoria-no-hija@example.com');
      const parent = await createCategory(user.id, 'EXPENSE', 'Transporte');
      const otherParent = await createCategory(user.id, 'EXPENSE', 'Comida');
      const child = await createCategory(user.id, 'EXPENSE', 'Restaurantes', otherParent.id);
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', date: '2026-08-01', categoryId: parent.id, subcategoryId: child.id, concept: 'x', amount: '10.00' })
        .expect(400);
    });

    it('rechaza (400) una subcategoría de tipo INCOME en un gasto', async () => {
      const user = await createUser('subcategoria-income@example.com');
      const parent = await createCategory(user.id, 'EXPENSE', 'Transporte');
      const incomeCategory = await createCategory(user.id, 'INCOME', 'Nómina');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', date: '2026-08-01', categoryId: parent.id, subcategoryId: incomeCategory.id, concept: 'x', amount: '10.00' })
        .expect(400);
    });

    it('una categoría de otro usuario se trata como no encontrada (404)', async () => {
      const owner = await createUser('categoria-ajena-dueno@example.com');
      const attacker = await createUser('categoria-ajena-atacante@example.com');
      const ownerCategory = await createCategory(owner.id, 'INCOME', 'Categoría del dueño');
      const attackerToken = await login(attacker.email);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(attackerToken))
        .send({ type: 'INCOME', date: '2026-08-01', categoryId: ownerCategory.id, concept: 'x', amount: '10.00' })
        .expect(404);
    });

    it('rechaza (400) una categoría cuyo tipo no coincide con el del movimiento', async () => {
      const user = await createUser('tipo-no-coincide@example.com');
      const expenseCategory = await createCategory(user.id, 'EXPENSE', 'Comida');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({ type: 'INCOME', date: '2026-08-01', categoryId: expenseCategory.id, concept: 'x', amount: '10.00' })
        .expect(400);
    });

    it('rechaza (400) un importe que no es positivo, con más de dos decimales o no numérico (spec.md §4)', async () => {
      const user = await createUser('importe-invalido@example.com');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const token = await login(user.email);

      for (const amount of ['0.00', '-10.00', '10.123', 'abc']) {
        await request(app.getHttpServer())
          .post('/transactions')
          .set('Authorization', auth(token))
          .send({ type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'x', amount })
          .expect(400);
      }
    });

    it('rechaza (400) un tipo de pago que no es uno de los válidos (spec.md §4)', async () => {
      const user = await createUser('tipo-pago-invalido@example.com');
      const category = await createCategory(user.id, 'EXPENSE', 'Comida');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({
          type: 'EXPENSE',
          date: '2026-08-01',
          categoryId: category.id,
          concept: 'x',
          amount: '10.00',
          paymentMethod: 'BIZUM',
        })
        .expect(400);
    });

    // Spec 011 (modo offline), plan.md §2: creación idempotente cuando el
    // cliente manda su propio `id` (generado sin conexión).
    it('acepta un id generado por el cliente y lo usa como identificador del movimiento', async () => {
      const user = await createUser('id-propio@example.com');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const token = await login(user.email);
      const clientId = randomUUID();

      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send({ id: clientId, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'Nómina agosto', amount: '2000.00' })
        .expect(201);

      expect(res.body.id).toBe(clientId);
    });

    it('reintentar el mismo POST con el mismo id y el mismo usuario es idempotente (no duplica el movimiento)', async () => {
      const user = await createUser('reintento-mismo-id@example.com');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const token = await login(user.email);
      const clientId = randomUUID();
      const body = { id: clientId, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'Nómina agosto', amount: '2000.00' };

      const first = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send(body)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(token))
        .send(body)
        .expect(201);

      expect(second.body).toEqual(first.body);
      const rows = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
      expect(rows).toHaveLength(1);
    });

    it('el mismo id desde otro usuario responde 409 y no toca el movimiento del primero', async () => {
      const owner = await createUser('id-propio-dueno@example.com');
      const other = await createUser('id-propio-otro@example.com');
      const ownerCategory = await createCategory(owner.id, 'INCOME', 'Nómina');
      const otherCategory = await createCategory(other.id, 'INCOME', 'Nómina');
      const ownerToken = await login(owner.email);
      const otherToken = await login(other.email);
      const clientId = randomUUID();

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(ownerToken))
        .send({ id: clientId, type: 'INCOME', date: '2026-08-01', categoryId: ownerCategory.id, concept: 'Nómina del primero', amount: '2000.00' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(otherToken))
        .send({ id: clientId, type: 'INCOME', date: '2026-08-01', categoryId: otherCategory.id, concept: 'Nómina del segundo', amount: '10.00' })
        .expect(409);

      const ownerRow = await db.query.transactions.findFirst({ where: eq(transactions.id, clientId) });
      expect(ownerRow?.concept).toBe('Nómina del primero');
      expect(ownerRow?.userId).toBe(owner.id);
    });
  });

  describe('GET /transactions', () => {
    it('lista solo los movimientos propios, filtra por cada criterio y calcula el resumen sobre el total filtrado', async () => {
      const owner = await createUser('listar-dueno@example.com');
      const other = await createUser('listar-otro@example.com');
      const income = await createCategory(owner.id, 'INCOME', 'Nómina');
      const expenseParent = await createCategory(owner.id, 'EXPENSE', 'Transporte');
      const expenseChild = await createCategory(owner.id, 'EXPENSE', 'Gasolina', expenseParent.id);
      const otherIncome = await createCategory(other.id, 'INCOME', 'Categoría ajena');

      await db.insert(transactions).values([
        { userId: owner.id, type: 'INCOME', date: '2026-08-01', categoryId: income.id, concept: 'Nómina agosto', amount: '2000.00' },
        {
          userId: owner.id,
          type: 'EXPENSE',
          date: '2026-08-05',
          categoryId: expenseParent.id,
          subcategoryId: expenseChild.id,
          concept: 'Depósito',
          merchant: 'Repsol',
          amount: '65.30',
        },
        { userId: owner.id, type: 'EXPENSE', date: '2026-07-10', categoryId: expenseParent.id, concept: 'Bus mensual', amount: '40.00' },
        { userId: other.id, type: 'INCOME', date: '2026-08-01', categoryId: otherIncome.id, concept: 'Ajeno', amount: '999.00' },
      ]);

      const token = await login(owner.email);

      const all = await request(app.getHttpServer()).get('/transactions').set('Authorization', auth(token)).expect(200);
      expect(all.body.items).toHaveLength(3);
      expect(all.body.totalItems).toBe(3);
      expect(all.body.summary.total).toBe('2105.30');
      // Los movimientos propios caen en dos meses distintos (2026-07 y 2026-08).
      expect(all.body.summary.averagePerMonth).toBe('1052.65');
      // H2 criterio 4: desglose por subcategoría — solo el "Depósito" (con
      // subcategoría) entra; "Bus mensual" (sin subcategoría) no aporta nada aquí.
      expect(all.body.summary.bySubcategory).toEqual([{ subcategoryId: expenseChild.id, total: '65.30' }]);

      const onlyIncome = await request(app.getHttpServer())
        .get('/transactions?type=INCOME')
        .set('Authorization', auth(token))
        .expect(200);
      expect(onlyIncome.body.items).toHaveLength(1);
      expect(onlyIncome.body.summary.total).toBe('2000.00');

      const byDateRange = await request(app.getHttpServer())
        .get('/transactions?dateFrom=2026-08-01&dateTo=2026-08-31')
        .set('Authorization', auth(token))
        .expect(200);
      expect(byDateRange.body.items).toHaveLength(2);

      const byCategory = await request(app.getHttpServer())
        .get(`/transactions?categoryId=${expenseParent.id}`)
        .set('Authorization', auth(token))
        .expect(200);
      expect(byCategory.body.items).toHaveLength(2);

      const bySubcategory = await request(app.getHttpServer())
        .get(`/transactions?subcategoryId=${expenseChild.id}`)
        .set('Authorization', auth(token))
        .expect(200);
      expect(bySubcategory.body.items).toHaveLength(1);

      const byMerchant = await request(app.getHttpServer())
        .get('/transactions?merchant=repsol')
        .set('Authorization', auth(token))
        .expect(200);
      expect(byMerchant.body.items).toHaveLength(1);

      const byText = await request(app.getHttpServer())
        .get('/transactions?q=nómina')
        .set('Authorization', auth(token))
        .expect(200);
      expect(byText.body.items).toHaveLength(1);
    });

    it('rechaza (400) un rango de fechas inválido (dateFrom posterior a dateTo)', async () => {
      const user = await createUser('rango-invalido@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .get('/transactions?dateFrom=2026-08-31&dateTo=2026-08-01')
        .set('Authorization', auth(token))
        .expect(400);
    });

    it('un mes/conjunto vacío devuelve 200 con todo a 0, no un error', async () => {
      const user = await createUser('conjunto-vacio@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/transactions').set('Authorization', auth(token)).expect(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.summary.total).toBe('0.00');
      expect(res.body.summary.averagePerMonth).toBeNull();
      expect(res.body.summary.byCategory).toEqual([]);
      expect(res.body.summary.bySubcategory).toEqual([]);
    });
  });

  describe('GET /transactions/:id', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/transactions/00000000-0000-0000-0000-000000000000').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('consultar-sin-verificar@example.com', 'PENDING_VERIFICATION');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const [transaction] = await db
        .insert(transactions)
        .values({ userId: user.id, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'x', amount: '10.00' })
        .returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .get(`/transactions/${transaction.id}`)
        .set('Authorization', auth(token))
        .expect(403);
    });

    it('devuelve un movimiento propio con sus datos completos', async () => {
      const user = await createUser('consultar-propio@example.com');
      const category = await createCategory(user.id, 'EXPENSE', 'Ocio');
      const [transaction] = await db
        .insert(transactions)
        .values({
          userId: user.id,
          type: 'EXPENSE',
          date: '2026-08-01',
          categoryId: category.id,
          concept: 'Cine',
          merchant: 'Cines Ejemplo',
          amount: '12.50',
        })
        .returning();
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .get(`/transactions/${transaction.id}`)
        .set('Authorization', auth(token))
        .expect(200);

      expect(res.body.id).toBe(transaction.id);
      expect(res.body.concept).toBe('Cine');
      expect(res.body.merchant).toBe('Cines Ejemplo');
      expect(res.body.amount).toBe('12.50');
    });

    it('un movimiento de otro usuario se trata como no encontrado (404)', async () => {
      const owner = await createUser('consultar-dueno@example.com');
      const attacker = await createUser('consultar-atacante@example.com');
      const category = await createCategory(owner.id, 'INCOME', 'Nómina');
      const [transaction] = await db
        .insert(transactions)
        .values({ userId: owner.id, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'x', amount: '10.00' })
        .returning();
      const attackerToken = await login(attacker.email);

      await request(app.getHttpServer())
        .get(`/transactions/${transaction.id}`)
        .set('Authorization', auth(attackerToken))
        .expect(404);
    });

    it('un id inexistente responde 404', async () => {
      const user = await createUser('consultar-inexistente@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .get('/transactions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', auth(token))
        .expect(404);
    });
  });

  describe('PATCH /transactions/:id', () => {
    it('edita parcialmente un movimiento propio', async () => {
      const user = await createUser('editar@example.com');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const [transaction] = await db
        .insert(transactions)
        .values({ userId: user.id, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'Original', amount: '100.00' })
        .returning();
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}`)
        .set('Authorization', auth(token))
        .send({ amount: '150.00' })
        .expect(200);

      expect(res.body.amount).toBe('150.00');
      expect(res.body.concept).toBe('Original');
    });

    it('al editar un gasto, permite cambiar la subcategoría a otra válida de la misma categoría', async () => {
      const user = await createUser('editar-subcategoria-valida@example.com');
      const parent = await createCategory(user.id, 'EXPENSE', 'Transporte');
      const child1 = await createCategory(user.id, 'EXPENSE', 'Gasolina', parent.id);
      const child2 = await createCategory(user.id, 'EXPENSE', 'Parking', parent.id);
      const [transaction] = await db
        .insert(transactions)
        .values({ userId: user.id, type: 'EXPENSE', date: '2026-08-01', categoryId: parent.id, subcategoryId: child1.id, concept: 'x', amount: '10.00' })
        .returning();
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}`)
        .set('Authorization', auth(token))
        .send({ subcategoryId: child2.id })
        .expect(200);

      expect(res.body.subcategoryId).toBe(child2.id);
    });

    it('al editar un gasto, revalida la subcategoría existente si se cambia la categoría (400 si deja de encajar)', async () => {
      const user = await createUser('editar-revalida-categoria@example.com');
      const parent = await createCategory(user.id, 'EXPENSE', 'Transporte');
      const child = await createCategory(user.id, 'EXPENSE', 'Gasolina', parent.id);
      const otherParent = await createCategory(user.id, 'EXPENSE', 'Comida');
      const [transaction] = await db
        .insert(transactions)
        .values({ userId: user.id, type: 'EXPENSE', date: '2026-08-01', categoryId: parent.id, subcategoryId: child.id, concept: 'x', amount: '10.00' })
        .returning();
      const token = await login(user.email);

      // Cambia solo la categoría (a "Comida"), sin tocar la subcategoría: "Gasolina" ya
      // no es hija de "Comida" — debe revalidar la combinación, no aceptarla a ciegas.
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}`)
        .set('Authorization', auth(token))
        .send({ categoryId: otherParent.id })
        .expect(400);
    });

    it('no se puede editar un movimiento de otro usuario (404)', async () => {
      const owner = await createUser('editar-dueno@example.com');
      const attacker = await createUser('editar-atacante@example.com');
      const category = await createCategory(owner.id, 'INCOME', 'Nómina');
      const [transaction] = await db
        .insert(transactions)
        .values({ userId: owner.id, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'x', amount: '10.00' })
        .returning();
      const attackerToken = await login(attacker.email);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}`)
        .set('Authorization', auth(attackerToken))
        .send({ amount: '999.00' })
        .expect(404);
    });
  });

  describe('DELETE /transactions/:id', () => {
    it('borra un movimiento propio', async () => {
      const user = await createUser('borrar@example.com');
      const category = await createCategory(user.id, 'INCOME', 'Nómina');
      const [transaction] = await db
        .insert(transactions)
        .values({ userId: user.id, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'x', amount: '10.00' })
        .returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .delete(`/transactions/${transaction.id}`)
        .set('Authorization', auth(token))
        .expect(204);

      const stillThere = await db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.id, transaction.id) });
      expect(stillThere).toBeUndefined();
    });

    it('no se puede borrar un movimiento de otro usuario (404)', async () => {
      const owner = await createUser('borrar-dueno@example.com');
      const attacker = await createUser('borrar-atacante@example.com');
      const category = await createCategory(owner.id, 'INCOME', 'Nómina');
      const [transaction] = await db
        .insert(transactions)
        .values({ userId: owner.id, type: 'INCOME', date: '2026-08-01', categoryId: category.id, concept: 'x', amount: '10.00' })
        .returning();
      const attackerToken = await login(attacker.email);

      await request(app.getHttpServer())
        .delete(`/transactions/${transaction.id}`)
        .set('Authorization', auth(attackerToken))
        .expect(404);

      const stillThere = await db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.id, transaction.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
