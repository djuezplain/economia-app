import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { Workbook } from 'exceljs';
import { and, eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { categories, transactions, users } from '../src/db/schema/index.js';

/**
 * Spec 003, plan.md §9: **nunca** se usa el fichero real de Diego aquí —
 * todos los workbooks se construyen sintéticamente con `exceljs` dentro de
 * este propio fichero de test.
 */

const INCOME_COLS = { fecha: 7, tipo: 8, concepto: 9, valor: 10 };
const EXPENSE_COLS = { fecha: 8, tipo: 9, subtipo: 10, concepto: 11, tienda: 12, valor: 13 };

interface IncomeRowInput {
  fecha?: unknown;
  tipo?: unknown;
  concepto?: unknown;
  valor?: unknown;
}

interface ExpenseRowInput {
  fecha?: unknown;
  tipo?: unknown;
  subtipo?: unknown;
  concepto?: unknown;
  tienda?: unknown;
  valor?: unknown;
}

async function buildWorkbookBuffer(options: {
  sheetNames?: { income?: string; expense?: string };
  incomeRows?: IncomeRowInput[];
  expenseRows?: ExpenseRowInput[];
}): Promise<Buffer> {
  const workbook = new Workbook();
  const incomeSheet = workbook.addWorksheet(options.sheetNames?.income ?? 'Ingresos');
  incomeSheet.getRow(1).values = ['A', 'B', 'C', 'D', 'E', 'F', 'Fecha', 'Tipo', 'Concepto', 'Valor', 'Mes'];
  (options.incomeRows ?? []).forEach((row, i) => {
    const excelRow = incomeSheet.getRow(i + 2);
    if (row.fecha !== undefined) excelRow.getCell(INCOME_COLS.fecha).value = row.fecha as never;
    if (row.tipo !== undefined) excelRow.getCell(INCOME_COLS.tipo).value = row.tipo as never;
    if (row.concepto !== undefined) excelRow.getCell(INCOME_COLS.concepto).value = row.concepto as never;
    if (row.valor !== undefined) excelRow.getCell(INCOME_COLS.valor).value = row.valor as never;
  });

  const expenseSheet = workbook.addWorksheet(options.sheetNames?.expense ?? 'Gastos');
  expenseSheet.getRow(1).values = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G',
    'Fecha', 'Tipo', 'Subtipo', 'Concepto', 'Tienda/Empresa', 'Valor', 'Mes',
  ];
  (options.expenseRows ?? []).forEach((row, i) => {
    const excelRow = expenseSheet.getRow(i + 2);
    if (row.fecha !== undefined) excelRow.getCell(EXPENSE_COLS.fecha).value = row.fecha as never;
    if (row.tipo !== undefined) excelRow.getCell(EXPENSE_COLS.tipo).value = row.tipo as never;
    if (row.subtipo !== undefined) excelRow.getCell(EXPENSE_COLS.subtipo).value = row.subtipo as never;
    if (row.concepto !== undefined) excelRow.getCell(EXPENSE_COLS.concepto).value = row.concepto as never;
    if (row.tienda !== undefined) excelRow.getCell(EXPENSE_COLS.tienda).value = row.tienda as never;
    if (row.valor !== undefined) excelRow.getCell(EXPENSE_COLS.valor).value = row.valor as never;
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('Importación de Excel (e2e) — spec 003 H1/H2', () => {
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
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  function attach(url: string, token: string, buffer: Buffer) {
    return request(app.getHttpServer())
      .post(url)
      .set('Authorization', auth(token))
      .attach('file', buffer, 'movimientos.xlsx');
  }

  describe('POST /import/excel/preview', () => {
    it('sin autenticar, responde 401', async () => {
      const buffer = await buildWorkbookBuffer({});
      await request(app.getHttpServer()).post('/import/excel/preview').attach('file', buffer, 'x.xlsx').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      const buffer = await buildWorkbookBuffer({});
      await attach('/import/excel/preview', token, buffer).expect(403);
    });

    it('fichero sin las hojas esperadas → 400', async () => {
      const user = await createUser('sin-hojas@example.com');
      const token = await login(user.email);
      const buffer = await buildWorkbookBuffer({ sheetNames: { income: 'Otra cosa' } });
      const res = await attach('/import/excel/preview', token, buffer).expect(400);
      expect(res.body.message).toMatch(/Ingresos/);
    });

    it('devuelve el resumen esperado sin crear ninguna fila en categories ni transactions', async () => {
      const user = await createUser('preview@example.com');
      const token = await login(user.email);
      await db.insert(categories).values({ userId: user.id, type: 'INCOME', name: 'Nómina' });

      const buffer = await buildWorkbookBuffer({
        incomeRows: [
          { fecha: new Date('2026-01-15'), tipo: 'Nomina', concepto: 'Sueldo enero', valor: 2000 }, // coincide (normalizado)
          { fecha: new Date('2026-01-16'), tipo: 'Bancos', concepto: 'Intereses cuenta', valor: 5 }, // categoría nueva
          { valor: 0 }, // inválida: faltan fecha, categoría, concepto
        ],
        expenseRows: [
          { fecha: new Date('2026-01-17'), tipo: 'Tarjeta', subtipo: 'Comida', concepto: 'Cena', valor: 32.4 },
        ],
      });

      const res = await attach('/import/excel/preview', token, buffer).expect(201);

      expect(res.body.income.validCount).toBe(2);
      expect(res.body.income.invalid).toHaveLength(1);
      expect(res.body.income.duplicates).toHaveLength(0); // caso límite 5 (plan.md §6): sin histórico, ningún duplicado
      expect(res.body.expense.validCount).toBe(1);
      expect(res.body.expense.invalid).toHaveLength(0);
      expect(res.body.expense.duplicates).toHaveLength(0);
      expect(res.body.newCategories.sort()).toEqual(['Bancos', 'Comida']);

      const allCategories = await db.query.categories.findMany({ where: eq(categories.userId, user.id) });
      const allTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
      expect(allCategories).toHaveLength(1); // solo la que ya existía
      expect(allTransactions).toHaveLength(0);
    });

    // Spec 012, H2: la vista previa señala cuántas de las válidas ya
    // existen, sin cambiar el significado de `validCount` (caso límite 6).
    it('señala en la vista previa las filas que ya existen, sin cambiar el significado de validCount', async () => {
      const user = await createUser('preview-duplicados@example.com');
      const token = await login(user.email);
      const [category] = await db.insert(categories).values({ userId: user.id, type: 'INCOME', name: 'Otros' }).returning();
      await db.insert(transactions).values({
        userId: user.id,
        type: 'INCOME',
        date: '2026-06-01',
        categoryId: category.id,
        concept: 'Ya existente',
        amount: '100.00',
      });

      const buffer = await buildWorkbookBuffer({
        incomeRows: [
          { fecha: new Date('2026-06-01'), tipo: 'Otros', concepto: 'Ya existente', valor: 100 }, // duplicado
          { fecha: new Date('2026-06-02'), tipo: 'Otros', concepto: 'Nuevo de verdad', valor: 50 }, // no duplicado
        ],
      });

      const res = await attach('/import/excel/preview', token, buffer).expect(201);

      expect(res.body.income.validCount).toBe(2); // sigue contando las 2, duplicada o no (H2 criterio 2)
      expect(res.body.income.duplicates).toHaveLength(1);
      expect(res.body.income.duplicates[0].reason).toMatch(/ya existe un movimiento igual/);

      // Nada se ha escrito de verdad: la vista previa no inserta.
      const allTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
      expect(allTransactions).toHaveLength(1); // solo la que ya existía de antes
    });

    // Corrección reportada por Diego: reimportar desde Google Sheets tras
    // corregir a mano un importe ya registrado duplicaba el movimiento en
    // vez de actualizarlo. `updated` señala en la vista previa las filas que
    // coinciden con un movimiento existente salvo el importe.
    it('señala en la vista previa las filas que coinciden con un movimiento existente salvo el importe', async () => {
      const user = await createUser('preview-importe-distinto@example.com');
      const token = await login(user.email);
      const [category] = await db.insert(categories).values({ userId: user.id, type: 'INCOME', name: 'Otros' }).returning();
      await db.insert(transactions).values({
        userId: user.id,
        type: 'INCOME',
        date: '2026-06-01',
        categoryId: category.id,
        concept: 'Ya existente',
        amount: '100.00',
      });

      const buffer = await buildWorkbookBuffer({
        incomeRows: [
          { fecha: new Date('2026-06-01'), tipo: 'Otros', concepto: 'Ya existente', valor: 120 }, // mismo movimiento, importe corregido
        ],
      });

      const res = await attach('/import/excel/preview', token, buffer).expect(201);

      expect(res.body.income.validCount).toBe(1);
      expect(res.body.income.duplicates).toHaveLength(0); // no es un duplicado exacto: el importe cambió
      expect(res.body.income.updated).toHaveLength(1);
      expect(res.body.income.updated[0].reason).toMatch(/importe/);
    });

    it('una fila cuya categoría todavía no existe nunca se marca como duplicado (caso límite 3)', async () => {
      const user = await createUser('categoria-nueva-nunca-duplicado@example.com');
      const token = await login(user.email);

      const buffer = await buildWorkbookBuffer({
        incomeRows: [{ fecha: new Date('2026-06-03'), tipo: 'Categoría Totalmente Nueva', concepto: 'Algo', valor: 20 }],
      });

      const res = await attach('/import/excel/preview', token, buffer).expect(201);

      expect(res.body.income.validCount).toBe(1);
      expect(res.body.income.duplicates).toHaveLength(0);
      expect(res.body.newCategories).toEqual(['Categoría Totalmente Nueva']);
    });
  });

  describe('POST /import/excel/confirm', () => {
    it('sin autenticar, responde 401', async () => {
      const buffer = await buildWorkbookBuffer({});
      await request(app.getHttpServer()).post('/import/excel/confirm').attach('file', buffer, 'x.xlsx').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar-confirm@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      const buffer = await buildWorkbookBuffer({});
      await attach('/import/excel/confirm', token, buffer).expect(403);
    });

    it('importa ingresos y gastos válidos, crea categorías nuevas sin duplicar las existentes (incluido el alias Acciones)', async () => {
      const user = await createUser('confirm@example.com');
      const token = await login(user.email);
      await db.insert(categories).values([
        { userId: user.id, type: 'INCOME', name: 'Acciones (venta)' },
        { userId: user.id, type: 'EXPENSE', name: 'Comida' },
      ]);

      const buffer = await buildWorkbookBuffer({
        incomeRows: [
          { fecha: new Date('2026-02-01'), tipo: 'Acciones', concepto: 'Venta acciones X', valor: 300.5 }, // alias
          { fecha: new Date('2026-02-02'), tipo: 'Bancos', concepto: 'Intereses', valor: 5 }, // categoría nueva
        ],
        expenseRows: [
          { fecha: new Date('2026-02-03'), tipo: 'Tarjeta', subtipo: 'Comida', concepto: 'Cena', tienda: 'Bar X', valor: 20 },
          { fecha: new Date('2026-02-04'), tipo: 'Recibos', subtipo: 'Peluqueria', concepto: 'Corte', valor: 15 }, // categoría nueva
        ],
      });

      const res = await attach('/import/excel/confirm', token, buffer).expect(201);

      expect(res.body.income.importedCount).toBe(2);
      expect(res.body.income.skippedDuplicateCount).toBe(0); // caso límite 5 (plan.md §6): sin histórico previo
      expect(res.body.expense.importedCount).toBe(2);
      expect(res.body.expense.skippedDuplicateCount).toBe(0);
      expect(res.body.categoriesCreated.sort()).toEqual(['Bancos', 'Peluqueria']);

      const allCategories = await db.query.categories.findMany({ where: eq(categories.userId, user.id) });
      expect(allCategories).toHaveLength(4); // 2 ya existían + 2 nuevas — ninguna duplicada

      const accionesCategory = allCategories.find((c) => c.name === 'Acciones (venta)');
      const accionesTx = await db.query.transactions.findFirst({
        where: and(eq(transactions.userId, user.id), eq(transactions.concept, 'Venta acciones X')),
      });
      expect(accionesTx?.categoryId).toBe(accionesCategory?.id); // se asoció al alias, no creó "Acciones" nueva
      // H1 criterio 2: fecha, concepto e importe del ingreso, tal cual el Excel.
      expect(accionesTx).toMatchObject({ type: 'INCOME', date: '2026-02-01', amount: '300.50', paymentMethod: null });

      const allTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
      expect(allTransactions).toHaveLength(4);

      // H1 criterio 3: el gasto importado lleva fecha, tipo de pago,
      // categoría, concepto, comercio e importe — y nunca subcategoría (el
      // Excel no distingue ese nivel, spec.md §4).
      const comidaCategory = allCategories.find((c) => c.name === 'Comida');
      const cenaTx = await db.query.transactions.findFirst({
        where: and(eq(transactions.userId, user.id), eq(transactions.concept, 'Cena')),
      });
      expect(cenaTx).toMatchObject({
        type: 'EXPENSE',
        date: '2026-02-03',
        categoryId: comidaCategory?.id,
        subcategoryId: null,
        merchant: 'Bar X',
        amount: '20.00',
        paymentMethod: 'CARD',
      });
      expect(allTransactions.every((t) => t.type !== 'EXPENSE' || t.subcategoryId === null)).toBe(true);
    });

    it('las filas inválidas no se importan y aparecen en el resumen con su motivo', async () => {
      const user = await createUser('invalidas@example.com');
      const token = await login(user.email);

      const buffer = await buildWorkbookBuffer({
        incomeRows: [{ fecha: new Date('2026-03-01'), tipo: 'Otros', concepto: 'Válida', valor: 100 }],
        expenseRows: [
          { fecha: new Date('2026-03-02'), tipo: null, subtipo: null, concepto: null, valor: 10 }, // faltan tipo de pago, categoría y concepto
        ],
      });

      const res = await attach('/import/excel/confirm', token, buffer).expect(201);

      expect(res.body.income.importedCount).toBe(1);
      expect(res.body.expense.importedCount).toBe(0);
      expect(res.body.expense.invalid).toHaveLength(1);
      expect(res.body.expense.invalid[0].reason).toMatch(/tipo de pago, categoría y concepto/);

      const allTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
      expect(allTransactions).toHaveLength(1);
    });

    // Spec 012 (detección de duplicados): esta spec invierte a propósito lo
    // que spec 003 dejaba documentado como comportamiento esperado — antes,
    // confirmar dos veces duplicaba los movimientos (no las categorías);
    // ahora tampoco duplica los movimientos. Caso límite 1 de plan.md §6
    // (el caso real que motivó la spec: reimportar el mismo fichero).
    it('confirmar dos veces con el mismo fichero no duplica ni las categorías nuevas ni los movimientos', async () => {
      const user = await createUser('doble-confirm@example.com');
      const token = await login(user.email);

      const buffer = await buildWorkbookBuffer({
        expenseRows: [
          { fecha: new Date('2026-04-01'), tipo: 'Tarjeta', subtipo: 'Bancos', concepto: 'Comisión', valor: 5 },
        ],
      });

      const first = await attach('/import/excel/confirm', token, buffer).expect(201);
      expect(first.body.expense.importedCount).toBe(1);
      expect(first.body.expense.skippedDuplicateCount).toBe(0);

      const second = await attach('/import/excel/confirm', token, buffer).expect(201);
      expect(second.body.expense.importedCount).toBe(0);
      expect(second.body.expense.skippedDuplicateCount).toBe(1);

      const allCategories = await db.query.categories.findMany({
        where: and(eq(categories.userId, user.id), eq(categories.name, 'Bancos')),
      });
      expect(allCategories).toHaveLength(1); // no duplicada (sin cambios respecto a spec 003)

      const allTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
      expect(allTransactions).toHaveLength(1); // spec 012: ya no se duplica
    });

    // Corrección reportada por Diego: reimportar (típicamente desde Google
    // Sheets, ver google-sheets-import.e2e-spec.ts) la misma fila con el
    // importe corregido duplicaba el movimiento en vez de actualizarlo —
    // ahora se actualiza el importe del movimiento existente.
    it('confirmar con la misma fila pero otro importe actualiza el movimiento existente en vez de duplicarlo', async () => {
      const user = await createUser('actualiza-importe@example.com');
      const token = await login(user.email);

      const buffer = await buildWorkbookBuffer({
        expenseRows: [
          { fecha: new Date('2026-04-05'), tipo: 'Tarjeta', subtipo: 'Bancos', concepto: 'Comisión', valor: 5 },
        ],
      });
      const first = await attach('/import/excel/confirm', token, buffer).expect(201);
      expect(first.body.expense.importedCount).toBe(1);
      expect(first.body.expense.updatedAmountCount).toBe(0);

      const bufferConImporteCorregido = await buildWorkbookBuffer({
        expenseRows: [
          { fecha: new Date('2026-04-05'), tipo: 'Tarjeta', subtipo: 'Bancos', concepto: 'Comisión', valor: 7.5 },
        ],
      });
      const second = await attach('/import/excel/confirm', token, bufferConImporteCorregido).expect(201);

      expect(second.body.expense.importedCount).toBe(0);
      expect(second.body.expense.skippedDuplicateCount).toBe(0);
      expect(second.body.expense.updatedAmountCount).toBe(1);

      const allTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
      expect(allTransactions).toHaveLength(1); // no duplica: actualiza el importe del mismo movimiento
      expect(allTransactions[0].amount).toBe('7.50');
    });

    it('una fila con los mismos datos pero otra categoría no se detecta como duplicado (H1 criterio 1: coincidencia exacta)', async () => {
      const user = await createUser('duplicado-otra-categoria@example.com');
      const token = await login(user.email);
      await db.insert(categories).values([
        { userId: user.id, type: 'EXPENSE', name: 'Comida' },
        { userId: user.id, type: 'EXPENSE', name: 'Ocio' },
      ]);
      await db.insert(transactions).values({
        userId: user.id,
        type: 'EXPENSE',
        date: '2026-04-01',
        categoryId: (await db.query.categories.findFirst({ where: and(eq(categories.userId, user.id), eq(categories.name, 'Comida')) }))!.id,
        concept: 'Cena',
        amount: '20.00',
        paymentMethod: 'CARD',
      });

      const buffer = await buildWorkbookBuffer({
        expenseRows: [{ fecha: new Date('2026-04-01'), tipo: 'Tarjeta', subtipo: 'Ocio', concepto: 'Cena', valor: 20 }],
      });

      const res = await attach('/import/excel/confirm', token, buffer).expect(201);
      expect(res.body.expense.importedCount).toBe(1); // categoría distinta → no es duplicado
      expect(res.body.expense.skippedDuplicateCount).toBe(0);
    });

    it('un ingreso y un gasto con los mismos datos no se consideran duplicados entre sí (caso límite 4)', async () => {
      const user = await createUser('ingreso-vs-gasto@example.com');
      const token = await login(user.email);
      // Categoría "Otros" existente para AMBOS tipos (no una categoría
      // nueva) — así el gasto sí llega a compararse de verdad en vez de
      // saltarse la comprobación por tener una categoría por crear.
      const [incomeCategory] = await db.insert(categories).values({ userId: user.id, type: 'INCOME', name: 'Otros' }).returning();
      await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Otros' });
      await db.insert(transactions).values({
        userId: user.id,
        type: 'INCOME',
        date: '2026-04-05',
        categoryId: incomeCategory.id,
        concept: 'Ajuste',
        amount: '10.00',
      });

      const buffer = await buildWorkbookBuffer({
        expenseRows: [{ fecha: new Date('2026-04-05'), tipo: 'Tarjeta', subtipo: 'Otros', concepto: 'Ajuste', valor: 10 }],
      });

      const res = await attach('/import/excel/confirm', token, buffer).expect(201);
      expect(res.body.expense.importedCount).toBe(1);
      expect(res.body.expense.skippedDuplicateCount).toBe(0);
    });

    it('todo lo creado pertenece al usuario autenticado (aislamiento)', async () => {
      const owner = await createUser('propietario-import@example.com');
      const other = await createUser('otro-import@example.com');
      const token = await login(owner.email);

      const buffer = await buildWorkbookBuffer({
        incomeRows: [{ fecha: new Date('2026-05-01'), tipo: 'Otros', concepto: 'Ingreso', valor: 50 }],
      });
      await attach('/import/excel/confirm', token, buffer).expect(201);

      const ownerTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, owner.id) });
      const otherTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, other.id) });
      const ownerCategories = await db.query.categories.findMany({ where: eq(categories.userId, owner.id) });
      const otherCategories = await db.query.categories.findMany({ where: eq(categories.userId, other.id) });

      expect(ownerTransactions).toHaveLength(1);
      expect(otherTransactions).toHaveLength(0);
      expect(ownerCategories).toHaveLength(1);
      expect(otherCategories).toHaveLength(0);
    });
  });
});
