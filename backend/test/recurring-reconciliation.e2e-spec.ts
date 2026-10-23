import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { Workbook } from 'exceljs';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import {
  categories,
  recurringOccurrenceResolutions,
  recurringTransactions,
  transactions,
  users,
} from '../src/db/schema/index.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';
import { RecurringReconciliationService } from '../src/recurring-transactions/recurring-reconciliation.service.js';

/**
 * Spec 049 H3 (conciliación de recibos recurrentes con movimientos
 * importados). Igual que `import.e2e-spec.ts`: los Excel se construyen aquí
 * con `exceljs`, nunca con el fichero real de Diego.
 */

const EXPENSE_COLS = { fecha: 8, tipo: 9, subtipo: 10, concepto: 11, tienda: 12, valor: 13 };

interface ExpenseRow {
  fecha: string;
  concepto: string;
  valor: number;
  categoria?: string;
  tienda?: string;
}

async function workbook(rows: ExpenseRow[]): Promise<Buffer> {
  const wb = new Workbook();
  wb.addWorksheet('Ingresos').getRow(1).values = ['A', 'B', 'C', 'D', 'E', 'F', 'Fecha', 'Tipo', 'Concepto', 'Valor', 'Mes'];
  const sheet = wb.addWorksheet('Gastos');
  sheet.getRow(1).values = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Fecha', 'Tipo', 'Subtipo', 'Concepto', 'Tienda/Empresa', 'Valor', 'Mes'];
  rows.forEach((row, i) => {
    const r = sheet.getRow(i + 2);
    r.getCell(EXPENSE_COLS.fecha).value = new Date(row.fecha);
    r.getCell(EXPENSE_COLS.tipo).value = 'Recibo';
    r.getCell(EXPENSE_COLS.subtipo).value = row.categoria ?? 'Vivienda';
    r.getCell(EXPENSE_COLS.concepto).value = row.concepto;
    r.getCell(EXPENSE_COLS.tienda).value = row.tienda ?? 'Banco';
    r.getCell(EXPENSE_COLS.valor).value = row.valor;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Conciliación de recibos recurrentes (e2e) — spec 049 H3', () => {
  let app: INestApplication<App>;
  let db: Database;
  let rateLimitGuard: RateLimitGuard;
  let reconciliation: RecurringReconciliationService;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = moduleFixture.get<Database>(DB);
    rateLimitGuard = moduleFixture.get<RateLimitGuard>(RateLimitGuard);
    reconciliation = moduleFixture.get(RecurringReconciliationService);
  });

  afterAll(async () => {
    await db.delete(recurringTransactions);
    await app.close();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete(recurringTransactions);
    await db.delete(transactions);
    await db.delete(categories);
    await db.delete(users);
    rateLimitGuard.resetForTests();
  });

  async function createUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken as string}`;
  }

  /** Usuario con categoría "Vivienda" y una plantilla de alquiler de 800 € el día 1 de cada mes desde enero de 2026. */
  async function setup(email = 'ana@example.com') {
    const user = await createUser(email);
    const [category] = await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Vivienda' }).returning();
    const token = await login(email);
    const res = await request(app.getHttpServer())
      .post('/recurring-transactions')
      .set('Authorization', token)
      .send({ type: 'EXPENSE', categoryId: category.id, concept: 'Alquiler', amount: '800.00', frequency: 'MONTHLY', startDate: '2026-01-01' })
      .expect(201);
    return { user, category, token, template: res.body as { id: string } };
  }

  function importExcel(token: string, buffer: Buffer) {
    return request(app.getHttpServer())
      .post('/import/excel/confirm')
      .set('Authorization', token)
      .attach('file', buffer, 'movimientos.xlsx');
  }

  function resolutionsOf(templateId: string) {
    return db.query.recurringOccurrenceResolutions.findMany({
      where: eq(recurringOccurrenceResolutions.recurringId, templateId),
    });
  }

  function movementsOf(userId: string) {
    return db.query.transactions.findMany({ where: eq(transactions.userId, userId) });
  }

  describe('al importar (T4.1)', () => {
    it('un único cargo que encaja concilia la ocurrencia sin crear ningún movimiento más', async () => {
      const { user, token, template } = await setup();
      const res = await importExcel(token, await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }])).expect(201);

      expect(res.body.reconciledCount).toBe(1);
      const movements = await movementsOf(user.id);
      expect(movements).toHaveLength(1);
      expect(await resolutionsOf(template.id)).toEqual([
        expect.objectContaining({
          occurrenceDate: '2026-10-01',
          status: 'RECONCILED',
          transactionId: movements[0].id,
          reconciledAutomatically: true,
        }),
      ]);
    });

    it('la ocurrencia conciliada sale como RECONCILED y ya no como pendiente', async () => {
      const { token } = await setup();
      await importExcel(token, await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }])).expect(201);
      const res = await request(app.getHttpServer())
        .get('/recurring-transactions/occurrences?from=2026-10-01&to=2026-10-01')
        .set('Authorization', token)
        .expect(200);
      expect(res.body[0]).toMatchObject({ status: 'RECONCILED' });
    });

    it('dos cargos posibles para la misma ocurrencia → no concilia ninguno', async () => {
      const { token, template } = await setup();
      const res = await importExcel(
        token,
        await workbook([
          { fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 },
          { fecha: '2026-09-29', concepto: 'TRANSFERENCIA PISO', valor: 800 },
        ]),
      ).expect(201);
      expect(res.body.reconciledCount).toBe(0);
      expect(await resolutionsOf(template.id)).toEqual([]);
    });

    it('si ya había un movimiento registrado a mano que encaja, no concilia solo', async () => {
      const { user, category, token, template } = await setup();
      await db.insert(transactions).values({ userId: user.id, type: 'EXPENSE', date: '2026-10-01', categoryId: category.id, concept: 'Alquiler a mano', amount: '800.00' });
      const res = await importExcel(token, await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }])).expect(201);
      expect(res.body.reconciledCount).toBe(0);
      expect(await resolutionsOf(template.id)).toEqual([]);
    });

    it('sin candidatos (otro importe, otra categoría o fuera de la ventana) no concilia', async () => {
      const { token, template } = await setup();
      const res = await importExcel(
        token,
        await workbook([
          { fecha: '2026-10-02', concepto: 'OTRO IMPORTE', valor: 799.99 },
          { fecha: '2026-10-02', concepto: 'OTRA CATEGORÍA', valor: 800, categoria: 'Ocio' },
          { fecha: '2026-10-07', concepto: 'FUERA DE VENTANA', valor: 800 },
        ]),
      ).expect(201);
      expect(res.body.reconciledCount).toBe(0);
      expect(await resolutionsOf(template.id)).toEqual([]);
    });

    it('sin plantillas, la importación funciona como antes y devuelve reconciledCount 0', async () => {
      const user = await createUser('sin@example.com');
      await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Vivienda' });
      const token = await login(user.email);
      const res = await importExcel(token, await workbook([{ fecha: '2026-10-02', concepto: 'Cualquier cosa', valor: 10 }])).expect(201);
      expect(res.body).toMatchObject({ reconciledCount: 0, expense: { importedCount: 1 } });
    });

    it('reimportar el mismo fichero no vuelve a conciliar ni duplica nada', async () => {
      const { user, token, template } = await setup();
      const buffer = await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }]);
      await importExcel(token, buffer).expect(201);
      const again = await importExcel(token, buffer).expect(201);

      expect(again.body).toMatchObject({ reconciledCount: 0, expense: { importedCount: 0, skippedDuplicateCount: 1 } });
      expect(await movementsOf(user.id)).toHaveLength(1);
      expect(await resolutionsOf(template.id)).toHaveLength(1);
    });

    it('una plantilla pausada no se concilia', async () => {
      const { token, template } = await setup();
      await request(app.getHttpServer()).patch(`/recurring-transactions/${template.id}`).set('Authorization', token).send({ active: false }).expect(200);
      const res = await importExcel(token, await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }])).expect(201);
      expect(res.body.reconciledCount).toBe(0);
    });

    it('un recibo variable concilia dentro del margen sobre la estimación', async () => {
      const { user, category, token } = await setup();
      const luz = await request(app.getHttpServer())
        .post('/recurring-transactions')
        .set('Authorization', token)
        .send({ type: 'EXPENSE', categoryId: category.id, concept: 'Luz', amount: '50.00', frequency: 'MONTHLY', startDate: '2026-01-15', variableAmount: true })
        .expect(201);
      // Desactiva el alquiler para que no interfiera con la categoría compartida.
      await db.update(recurringTransactions).set({ active: false }).where(eq(recurringTransactions.concept, 'Alquiler'));

      const res = await importExcel(token, await workbook([{ fecha: '2026-10-14', concepto: 'IBERDROLA', valor: 68.4 }])).expect(201);
      expect(res.body.reconciledCount).toBe(1);
      const [resolution] = await resolutionsOf(luz.body.id as string);
      const [movement] = await movementsOf(user.id);
      expect(resolution).toMatchObject({ occurrenceDate: '2026-10-15', status: 'RECONCILED', transactionId: movement.id });
    });

    it('si algo falla tras insertar, se deshacen juntos los movimientos y las conciliaciones', async () => {
      const { user, token, template } = await setup();
      const original = reconciliation.reconcileImported.bind(reconciliation);
      vi.spyOn(reconciliation, 'reconcileImported').mockImplementation(async (...args) => {
        await original(...args);
        throw new Error('fallo simulado');
      });

      await importExcel(token, await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }])).expect(500);
      expect(await movementsOf(user.id)).toHaveLength(0);
      expect(await resolutionsOf(template.id)).toEqual([]);
    });

    it('aislamiento: los movimientos importados de un usuario no concilian plantillas de otro', async () => {
      const ana = await setup('ana@example.com');
      const bea = await setup('bea@example.com');
      const res = await importExcel(bea.token, await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }])).expect(201);
      expect(res.body.reconciledCount).toBe(1);
      expect(await resolutionsOf(ana.template.id)).toEqual([]);
      expect(await resolutionsOf(bea.template.id)).toHaveLength(1);
    });
  });

  describe('conciliación manual (T4.2)', () => {
    async function addMovement(userId: string, categoryId: string, date: string, amount: string, concept = 'Movimiento') {
      const [t] = await db.insert(transactions).values({ userId, type: 'EXPENSE', date, categoryId, concept, amount }).returning();
      return t;
    }

    function post(token: string, path: string, body: object = {}) {
      return request(app.getHttpServer()).post(`/recurring-transactions${path}`).set('Authorization', token).send(body);
    }

    it('concilia a mano una ocurrencia con un movimiento elegido', async () => {
      const { user, category, token, template } = await setup();
      const movement = await addMovement(user.id, category.id, '2026-10-03', '812.00');

      await post(token, `/${template.id}/occurrences/2026-10-01/reconcile`, { transactionId: movement.id }).expect(204);
      expect(await resolutionsOf(template.id)).toEqual([
        expect.objectContaining({ occurrenceDate: '2026-10-01', status: 'RECONCILED', transactionId: movement.id, reconciledAutomatically: false }),
      ]);
      expect(await movementsOf(user.id)).toHaveLength(1);
    });

    it('409 si la ocurrencia ya está resuelta o el movimiento ya resuelve otra', async () => {
      const { user, category, token, template } = await setup();
      const a = await addMovement(user.id, category.id, '2026-10-01', '800.00');
      const b = await addMovement(user.id, category.id, '2026-11-01', '800.00');

      await post(token, `/${template.id}/occurrences/2026-10-01/reconcile`, { transactionId: a.id }).expect(204);
      await post(token, `/${template.id}/occurrences/2026-10-01/reconcile`, { transactionId: b.id }).expect(409);
      await post(token, `/${template.id}/occurrences/2026-11-01/reconcile`, { transactionId: a.id }).expect(409);
      await post(token, `/${template.id}/occurrences/2026-09-01/confirm`).expect(200);
      await post(token, `/${template.id}/occurrences/2026-09-01/reconcile`, { transactionId: b.id }).expect(409);
    });

    it('400 si la fecha no es una ocurrencia de la plantilla', async () => {
      const { user, category, token, template } = await setup();
      const movement = await addMovement(user.id, category.id, '2026-10-01', '800.00');
      await post(token, `/${template.id}/occurrences/2026-10-02/reconcile`, { transactionId: movement.id }).expect(400);
      await request(app.getHttpServer())
        .delete(`/recurring-transactions/${template.id}/occurrences/no-es-fecha/reconciliation`)
        .set('Authorization', token)
        .expect(400);
    });

    it('deshacer devuelve la ocurrencia a pendiente sin borrar el movimiento; no deshace una confirmada', async () => {
      const { user, category, token, template } = await setup();
      const movement = await addMovement(user.id, category.id, '2026-10-01', '800.00');
      await post(token, `/${template.id}/occurrences/2026-10-01/reconcile`, { transactionId: movement.id }).expect(204);

      const undo = (date: string) =>
        request(app.getHttpServer()).delete(`/recurring-transactions/${template.id}/occurrences/${date}/reconciliation`).set('Authorization', token);
      await undo('2026-10-01').expect(204);
      expect(await resolutionsOf(template.id)).toEqual([]);
      expect(await movementsOf(user.id)).toHaveLength(1);
      await undo('2026-10-01').expect(409);

      await post(token, `/${template.id}/occurrences/2026-09-01/confirm`).expect(200);
      await undo('2026-09-01').expect(409);
    });

    it('omitir una ocurrencia conciliada → 409', async () => {
      const { user, category, token, template } = await setup();
      const movement = await addMovement(user.id, category.id, '2026-10-01', '800.00');
      await post(token, `/${template.id}/occurrences/2026-10-01/reconcile`, { transactionId: movement.id }).expect(204);
      await post(token, `/${template.id}/occurrences/2026-10-01/skip`).expect(409);
    });

    it('deshacer una conciliación automática y reimportar el mismo fichero no la vuelve a hacer', async () => {
      const { token, template } = await setup();
      const buffer = await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }]);
      await importExcel(token, buffer).expect(201);
      await request(app.getHttpServer())
        .delete(`/recurring-transactions/${template.id}/occurrences/2026-10-01/reconciliation`)
        .set('Authorization', token)
        .expect(204);

      const again = await importExcel(token, buffer).expect(201);
      expect(again.body.reconciledCount).toBe(0);
      expect(await resolutionsOf(template.id)).toEqual([]);
    });

    it('candidates: del mismo tipo en ±15 días, sin enlazar, con los que encajan primero', async () => {
      const { user, category, token, template } = await setup();
      const [ocio] = await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Ocio' }).returning();
      const encaja = await addMovement(user.id, category.id, '2026-10-04', '800.00', 'encaja');
      const cercaNoEncaja = await addMovement(user.id, ocio.id, '2026-10-01', '25.00', 'cerca, otra categoría');
      const lejosNoEncaja = await addMovement(user.id, category.id, '2026-10-14', '12.00', 'lejos');
      await addMovement(user.id, category.id, '2026-10-20', '800.00', 'fuera de ±15');
      const enlazado = await addMovement(user.id, category.id, '2026-09-01', '800.00', 'ya enlazado');
      await post(token, `/${template.id}/occurrences/2026-09-01/reconcile`, { transactionId: enlazado.id }).expect(204);
      await db.insert(transactions).values({ userId: user.id, type: 'INCOME', date: '2026-10-01', categoryId: category.id, concept: 'ingreso', amount: '800.00' });

      const res = await request(app.getHttpServer())
        .get(`/recurring-transactions/${template.id}/occurrences/2026-10-01/candidates`)
        .set('Authorization', token)
        .expect(200);
      expect((res.body as Array<{ id: string }>).map((t) => t.id)).toEqual([encaja.id, cercaNoEncaja.id, lejosNoEncaja.id]);
    });

    it('aislamiento: 404 con plantilla o movimiento de otro usuario en cada endpoint', async () => {
      const ana = await setup('ana@example.com');
      const bea = await setup('bea@example.com');
      const deAna = await addMovement(ana.user.id, ana.category.id, '2026-10-01', '800.00');
      const deBea = await addMovement(bea.user.id, bea.category.id, '2026-10-01', '800.00');

      // Bea con la plantilla de Ana.
      await post(bea.token, `/${ana.template.id}/occurrences/2026-10-01/reconcile`, { transactionId: deBea.id }).expect(404);
      await post(bea.token, `/${ana.template.id}/occurrences/2026-10-01/dismiss`, { transactionId: deBea.id }).expect(404);
      await request(app.getHttpServer()).get(`/recurring-transactions/${ana.template.id}/occurrences/2026-10-01/candidates`).set('Authorization', bea.token).expect(404);
      await request(app.getHttpServer()).delete(`/recurring-transactions/${ana.template.id}/occurrences/2026-10-01/reconciliation`).set('Authorization', bea.token).expect(404);
      // Bea con su plantilla y el movimiento de Ana.
      await post(bea.token, `/${bea.template.id}/occurrences/2026-10-01/reconcile`, { transactionId: deAna.id }).expect(404);
      await post(bea.token, `/${bea.template.id}/occurrences/2026-10-01/dismiss`, { transactionId: deAna.id }).expect(404);
      // Y los candidatos de Bea no incluyen movimientos de Ana.
      const res = await request(app.getHttpServer()).get(`/recurring-transactions/${bea.template.id}/occurrences/2026-10-01/candidates`).set('Authorization', bea.token).expect(200);
      expect((res.body as Array<{ id: string }>).map((t) => t.id)).toEqual([deBea.id]);
      expect(await resolutionsOf(ana.template.id)).toEqual([]);
    });
  });

  describe('Por conciliar: sugerencias, posibles duplicados y recientes (T4.3)', () => {
    /** Primer día del mes actual: siempre dentro de los últimos 90 días y no posterior a hoy. */
    function currentMonthStart(): string {
      return `${new Date().toISOString().slice(0, 7)}-01`;
    }
    function plusDays(iso: string, days: number): string {
      return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    }

    async function addMovement(userId: string, categoryId: string, date: string, amount: string, concept = 'Movimiento') {
      const [t] = await db.insert(transactions).values({ userId, type: 'EXPENSE', date, categoryId, concept, amount }).returning();
      return t;
    }

    async function overview(token: string) {
      const res = await request(app.getHttpServer()).get('/recurring-transactions/reconciliation').set('Authorization', token).expect(200);
      return res.body as {
        suggestions: Array<{ occurrence: { recurringId: string; date: string; concept: string; expectedAmount: string }; candidates: Array<{ id: string }> }>;
        possibleDuplicates: Array<{ recurringId: string; date: string; createdTransaction: { id: string }; candidates: Array<{ id: string }> }>;
        recentlyReconciled: Array<{ recurringId: string; date: string; reconciledAutomatically: boolean; transaction: { id: string } | null }>;
      };
    }

    function post(token: string, path: string, body: object = {}) {
      return request(app.getHttpServer()).post(`/recurring-transactions${path}`).set('Authorization', token).send(body);
    }

    it('un movimiento registrado a mano que encaja sale como sugerencia, sin conciliarse solo', async () => {
      const { user, category, token, template } = await setup();
      const date = currentMonthStart();
      const movement = await addMovement(user.id, category.id, plusDays(date, 1), '800.00');

      const { suggestions } = await overview(token);
      expect(suggestions).toEqual([
        expect.objectContaining({
          occurrence: expect.objectContaining({ recurringId: template.id, date, concept: 'Alquiler', expectedAmount: '800.00' }),
          candidates: [expect.objectContaining({ id: movement.id })],
        }),
      ]);
      expect(await resolutionsOf(template.id)).toEqual([]);
    });

    it('con dos candidatos, los sugiere ordenados (el más cercano en fecha primero)', async () => {
      const { user, category, token } = await setup();
      const date = currentMonthStart();
      const lejos = await addMovement(user.id, category.id, plusDays(date, 4), '800.00');
      const cerca = await addMovement(user.id, category.id, plusDays(date, 1), '800.00');
      const { suggestions } = await overview(token);
      expect(suggestions[0].candidates.map((c) => c.id)).toEqual([cerca.id, lejos.id]);
    });

    it('descartar el único candidato hace desaparecer la sugerencia', async () => {
      const { user, category, token, template } = await setup();
      const date = currentMonthStart();
      const movement = await addMovement(user.id, category.id, date, '800.00');
      await post(token, `/${template.id}/occurrences/${date}/dismiss`, { transactionId: movement.id }).expect(204);
      await post(token, `/${template.id}/occurrences/${date}/dismiss`, { transactionId: movement.id }).expect(204);
      expect((await overview(token)).suggestions).toEqual([]);
    });

    it('un confirmado con su cargo importado gemelo sale como posible duplicado, también con más de 90 días', async () => {
      const { user, category, token, template } = await setup();
      const created = await post(token, `/${template.id}/occurrences/2026-01-01/confirm`).expect(200);
      const imported = await addMovement(user.id, category.id, '2026-01-02', '800.00', 'RECIBO ALQUILER ENE');

      const { possibleDuplicates } = await overview(token);
      expect(possibleDuplicates).toEqual([
        expect.objectContaining({
          recurringId: template.id,
          date: '2026-01-01',
          createdTransaction: expect.objectContaining({ id: created.body.id as string }),
          candidates: [expect.objectContaining({ id: imported.id })],
        }),
      ]);
    });

    it('resolver el duplicado borra el movimiento creado y concilia con el importado, en una sola operación', async () => {
      const { user, category, token, template } = await setup();
      const created = await post(token, `/${template.id}/occurrences/2026-01-01/confirm`).expect(200);
      const imported = await addMovement(user.id, category.id, '2026-01-02', '800.00', 'RECIBO ALQUILER ENE');

      await post(token, `/${template.id}/occurrences/2026-01-01/resolve-duplicate`, { keepTransactionId: imported.id }).expect(204);

      expect((await movementsOf(user.id)).map((t) => t.id)).toEqual([imported.id]);
      expect(await resolutionsOf(template.id)).toEqual([
        expect.objectContaining({ status: 'RECONCILED', transactionId: imported.id, reconciledAutomatically: false }),
      ]);
      expect((await overview(token)).possibleDuplicates).toEqual([]);
      expect(created.body.id).not.toBe(imported.id);
    });

    it('resolve-duplicate: 400 si se conserva el propio creado, 409 si no está confirmada, 404 con un movimiento ajeno', async () => {
      const { user, category, token, template } = await setup();
      const created = await post(token, `/${template.id}/occurrences/2026-01-01/confirm`).expect(200);
      const imported = await addMovement(user.id, category.id, '2026-02-02', '800.00');
      const otro = await setup('otro@example.com');
      const ajeno = await addMovement(otro.user.id, otro.category.id, '2026-01-02', '800.00');

      await post(token, `/${template.id}/occurrences/2026-01-01/resolve-duplicate`, { keepTransactionId: created.body.id as string }).expect(400);
      await post(token, `/${template.id}/occurrences/2026-02-01/resolve-duplicate`, { keepTransactionId: imported.id }).expect(409);
      await post(token, `/${template.id}/occurrences/2026-01-01/resolve-duplicate`, { keepTransactionId: ajeno.id }).expect(404);
      await post(otro.token, `/${template.id}/occurrences/2026-01-01/resolve-duplicate`, { keepTransactionId: ajeno.id }).expect(404);
      expect(await movementsOf(user.id)).toHaveLength(2);
    });

    it('"no es un duplicado" (descartar) lo quita de la lista sin borrar nada', async () => {
      const { user, category, token, template } = await setup();
      await post(token, `/${template.id}/occurrences/2026-01-01/confirm`).expect(200);
      const imported = await addMovement(user.id, category.id, '2026-01-02', '800.00');
      await post(token, `/${template.id}/occurrences/2026-01-01/dismiss`, { transactionId: imported.id }).expect(204);
      expect((await overview(token)).possibleDuplicates).toEqual([]);
      expect(await movementsOf(user.id)).toHaveLength(2);
    });

    it('una plantilla pausada no genera sugerencias, pero sus posibles duplicados siguen saliendo', async () => {
      const { user, category, token, template } = await setup();
      await post(token, `/${template.id}/occurrences/2026-01-01/confirm`).expect(200);
      await addMovement(user.id, category.id, '2026-01-02', '800.00');
      await addMovement(user.id, category.id, currentMonthStart(), '800.00');
      await request(app.getHttpServer()).patch(`/recurring-transactions/${template.id}`).set('Authorization', token).send({ active: false }).expect(200);

      const result = await overview(token);
      expect(result.suggestions).toEqual([]);
      expect(result.possibleDuplicates).toHaveLength(1);
    });

    it('recientes: lista las conciliaciones (automáticas y manuales) con su movimiento; deshacer la quita', async () => {
      const { user, category, token, template } = await setup();
      await importExcel(token, await workbook([{ fecha: '2026-10-02', concepto: 'RECIBO ALQUILER OCT', valor: 800 }])).expect(201);
      const manual = await addMovement(user.id, category.id, '2026-09-01', '800.00');
      await post(token, `/${template.id}/occurrences/2026-09-01/reconcile`, { transactionId: manual.id }).expect(204);

      const { recentlyReconciled } = await overview(token);
      expect(recentlyReconciled.map((r) => [r.date, r.reconciledAutomatically])).toEqual(
        expect.arrayContaining([
          ['2026-10-01', true],
          ['2026-09-01', false],
        ]),
      );
      expect(recentlyReconciled.find((r) => r.date === '2026-09-01')?.transaction?.id).toBe(manual.id);

      await request(app.getHttpServer()).delete(`/recurring-transactions/${template.id}/occurrences/2026-09-01/reconciliation`).set('Authorization', token).expect(204);
      expect((await overview(token)).recentlyReconciled.map((r) => r.date)).toEqual(['2026-10-01']);
    });

    it('aislamiento: cada usuario solo ve lo suyo', async () => {
      const ana = await setup('ana@example.com');
      const bea = await setup('bea@example.com');
      await post(ana.token, `/${ana.template.id}/occurrences/2026-01-01/confirm`).expect(200);
      await addMovement(ana.user.id, ana.category.id, '2026-01-02', '800.00');
      await addMovement(ana.user.id, ana.category.id, currentMonthStart(), '800.00');

      expect(await overview(bea.token)).toEqual({ suggestions: [], possibleDuplicates: [], recentlyReconciled: [] });
      expect((await overview(ana.token)).possibleDuplicates).toHaveLength(1);
    });
  });
});
