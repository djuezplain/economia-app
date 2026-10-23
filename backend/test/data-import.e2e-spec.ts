import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import {
  bankAccountBalances,
  bankAccounts,
  cashBalances,
  cashHoldings,
  categories,
  cryptoPurchases,
  cryptos,
  expenseBudgets,
  fundPurchases,
  fundSales,
  funds,
  pensionPlanContributions,
  pensionPlans,
  vehicleValuations,
  vehicles,
  recurringOccurrenceResolutions,
  recurringReconciliationDismissals,
  recurringTransactions,
  products,
  receiptLines,
  receipts,
  shoppingListItems,
  supermarkets,
  stockPurchases,
  stocks,
  transactions,
  users,
} from '../src/db/schema/index.js';
import { ECONOMIC_DATA_TABLE_ORDER, EXPORT_FORMAT_VERSION } from '../src/data-export/account-export.types.js';
import type { EconomicData } from '../src/data-export/account-export.types.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';

/**
 * Spec 032, plan.md §7. Fixtures tal como llegan realmente por HTTP: tras
 * `JSON.parse` en el servidor, `createdAt`/`updatedAt` son texto ISO, no
 * `Date` (a diferencia de `EconomicData`, que describe la fila tal como la
 * devuelve Drizzle en memoria, tipo usado por el export antes de
 * serializar) — de ahí `EconomicDataJson`, en vez de `Partial<EconomicData>`.
 */
type EconomicDataJson = Record<keyof EconomicData, Record<string, unknown>[]>;

/** Un fichero con las 24 claves vacías por defecto — cada test rellena solo las que necesita. */
function emptyEconomicData(): EconomicDataJson {
  return Object.fromEntries(ECONOMIC_DATA_TABLE_ORDER.map((key) => [key, []])) as unknown as EconomicDataJson;
}

function buildFile(overrides: Partial<EconomicDataJson>, formatVersion: unknown = EXPORT_FORMAT_VERSION) {
  return {
    formatVersion,
    exportedAt: new Date().toISOString(),
    profile: { name: 'Usuario de prueba', currency: 'EUR', locale: 'es' },
    economicData: { ...emptyEconomicData(), ...overrides },
  };
}

function fileBuffer(file: unknown): Buffer {
  return Buffer.from(JSON.stringify(file), 'utf-8');
}

describe('Importar datos (e2e) — spec 032 H2', () => {
  let app: INestApplication<App>;
  let db: Database;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = moduleFixture.get<Database>(DB);
  });

  afterAll(async () => {
    // Igual que las suites de la spec 047: las demás suites borran
    // `categories` sin saber de plantillas (FK restrict), así que no se dejan
    // plantillas al terminar.
    await db.delete(recurringTransactions);
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(users);
    // Spec 048: con las suites nuevas este fichero hace más logins que el
    // límite por IP; mismo reinicio que el resto de suites con muchos logins.
    app.get(RateLimitGuard).resetForTests();
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

  function attach(url: string, token: string, file: unknown) {
    return request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fileBuffer(file), 'export.json');
  }

  it('sin autenticar, responde 401 en preview y confirm', async () => {
    const file = buildFile({});
    await request(app.getHttpServer()).post('/data-import/preview').attach('file', fileBuffer(file), 'export.json').expect(401);
    await request(app.getHttpServer()).post('/data-import/confirm').attach('file', fileBuffer(file), 'export.json').expect(401);
  });

  it('un fichero que no es JSON válido se rechaza (400) sin escribir nada', async () => {
    const user = await createUser('import-json-invalido@example.com');
    const token = await login(user.email);

    await request(app.getHttpServer())
      .post('/data-import/confirm')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('esto no es json'), 'export.json')
      .expect(400);

    const rows = await db.select().from(categories).where(eq(categories.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it('un fichero con formatVersion incompatible se rechaza (400) sin escribir nada', async () => {
    const user = await createUser('import-version-incompatible@example.com');
    const token = await login(user.email);
    const file = buildFile(
      { categories: [{ id: randomUUID(), userId: randomUUID(), type: 'INCOME', name: 'X', parentId: null, isDefault: false, icon: null, createdAt: new Date().toISOString() }] },
      99,
    );

    await attach('/data-import/confirm', token, file).expect(400);

    const rows = await db.select().from(categories).where(eq(categories.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it('un fichero con una clave de economicData desconocida o faltante se rechaza (400)', async () => {
    const user = await createUser('import-claves-incorrectas@example.com');
    const token = await login(user.email);
    const malformed = buildFile({});
    delete (malformed.economicData as unknown as Record<string, unknown>).categories;

    await attach('/data-import/confirm', token, malformed).expect(400);
  });

  it('preview no escribe nada y cuenta correctamente nuevos vs. ya existentes', async () => {
    const user = await createUser('import-preview@example.com');
    const token = await login(user.email);
    const categoryId = randomUUID();
    const file = buildFile({
      categories: [
        {
          id: categoryId,
          userId: randomUUID(),
          type: 'INCOME',
          name: 'Nómina',
          parentId: null,
          isDefault: false,
          icon: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const res = await attach('/data-import/preview', token, file).expect(201);
    expect(res.body.categories).toEqual({ total: 1, toImport: 1, alreadyExisting: 0, omitted: 0 });
    expect(res.body.transactions).toEqual({ total: 0, toImport: 0, alreadyExisting: 0, omitted: 0 });

    const rows = await db.select().from(categories).where(eq(categories.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it('importa un export propio con jerarquía padre-hijo (acción con compra) — todo nuevo, aislado por usuario', async () => {
    const user = await createUser('import-jerarquia@example.com');
    const token = await login(user.email);
    const stockId = randomUUID();
    const purchaseId = randomUUID();
    const now = new Date().toISOString();
    const file = buildFile({
      stocks: [{ id: stockId, userId: randomUUID(), custodyBank: 'Broker', stock: 'ACME', createdAt: now, updatedAt: now }],
      stockPurchases: [{ id: purchaseId, stockId, shareCount: '10', purchasePrice: '5', date: '2026-01-01', createdAt: now, updatedAt: now }],
    });

    const res = await attach('/data-import/confirm', token, file).expect(201);
    expect(res.body.stocks).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });
    expect(res.body.stockPurchases).toEqual({ total: 1, toImport: 1, alreadyExisting: 0, omitted: 0 });

    const [insertedStock] = await db.select().from(stocks).where(eq(stocks.id, stockId));
    // H2 criterio 6: el `userId` del fichero se ignora siempre — la fila queda bajo el usuario autenticado.
    expect(insertedStock.userId).toBe(user.id);

    const insertedPurchases = await db.select().from(stockPurchases).where(eq(stockPurchases.stockId, stockId));
    expect(insertedPurchases).toHaveLength(1);
    expect(insertedPurchases[0].id).toBe(purchaseId);
  });

  it('reimportar el mismo fichero no duplica nada (idempotente)', async () => {
    const user = await createUser('import-idempotente@example.com');
    const token = await login(user.email);
    const categoryId = randomUUID();
    const now = new Date().toISOString();
    const file = buildFile({
      categories: [{ id: categoryId, userId: randomUUID(), type: 'INCOME', name: 'Nómina', parentId: null, isDefault: false, icon: null, createdAt: now }],
    });

    await attach('/data-import/confirm', token, file).expect(201);
    const second = await attach('/data-import/confirm', token, file).expect(201);

    expect(second.body.categories).toEqual({ total: 1, toImport: 0, alreadyExisting: 1, omitted: 0 });
    const rows = await db.select().from(categories).where(eq(categories.id, categoryId));
    expect(rows).toHaveLength(1);
  });

  it('un fichero con userId de otra cuenta en sus filas nunca escribe bajo esa otra cuenta', async () => {
    const owner = await createUser('import-aislamiento-dueno@example.com');
    const other = await createUser('import-aislamiento-otro@example.com');
    const token = await login(owner.email);
    const categoryId = randomUUID();
    const now = new Date().toISOString();
    const file = buildFile({
      categories: [{ id: categoryId, userId: other.id, type: 'INCOME', name: 'No debería colarse en otra cuenta', parentId: null, isDefault: false, icon: null, createdAt: now }],
    });

    await attach('/data-import/confirm', token, file).expect(201);

    const [inserted] = await db.select().from(categories).where(eq(categories.id, categoryId));
    expect(inserted.userId).toBe(owner.id);

    const otherRows = await db.select().from(categories).where(eq(categories.userId, other.id));
    expect(otherRows).toHaveLength(0);
  });

  it('si una fila a mitad del fichero es inválida, no se importa nada (todo o nada)', async () => {
    const user = await createUser('import-todo-o-nada@example.com');
    const token = await login(user.email);
    const now = new Date().toISOString();
    const file = buildFile({
      // Válida por forma (id UUID) pero le falta un campo NOT NULL (`name`) — el INSERT fallará dentro de la transacción.
      categories: [{ id: randomUUID(), userId: randomUUID(), type: 'INCOME', parentId: null, isDefault: false, icon: null, createdAt: now }],
      transactions: [
        {
          id: randomUUID(),
          userId: randomUUID(),
          type: 'INCOME',
          date: '2026-01-01',
          categoryId: randomUUID(),
          concept: 'No debería quedar importado',
          amount: '10.00',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await attach('/data-import/confirm', token, file).expect(400);

    const remainingTransactions = await db.select().from(transactions).where(eq(transactions.userId, user.id));
    expect(remainingTransactions).toHaveLength(0);
  });

  describe('movimientos recurrentes (spec 047)', () => {
    const now = () => new Date().toISOString();
    const category = (id: string) => ({ id, userId: randomUUID(), type: 'EXPENSE', name: 'Vivienda', parentId: null, isDefault: false, icon: null, createdAt: now() });
    const template = (id: string, categoryId: string) => ({
      id, userId: randomUUID(), type: 'EXPENSE', categoryId, subcategoryId: null, concept: 'Alquiler', merchant: null, amount: '600.00',
      paymentMethod: null, frequency: 'MONTHLY', startDate: '2026-01-05', endDate: null, active: true, createdAt: now(), updatedAt: now(),
    });

    it('un fichero de una copia anterior (sin las claves de recurrentes) se sigue importando', async () => {
      const user = await createUser('import-sin-recurrentes@example.com');
      const token = await login(user.email);
      const file = buildFile({ categories: [category(randomUUID())] });
      delete (file.economicData as unknown as Record<string, unknown>).recurringTransactions;
      delete (file.economicData as unknown as Record<string, unknown>).recurringOccurrenceResolutions;

      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body.categories.toImport).toBe(1);
      expect(res.body.recurringTransactions).toEqual({ total: 0, toImport: 0, alreadyExisting: 0, omitted: 0 });
    });

    it('importa plantillas y sus resoluciones bajo el usuario autenticado, y reimportar no duplica', async () => {
      const user = await createUser('import-recurrentes@example.com');
      const token = await login(user.email);
      const categoryId = randomUUID();
      const templateId = randomUUID();
      const transactionId = randomUUID();
      const file = buildFile({
        categories: [category(categoryId)],
        transactions: [
          { id: transactionId, userId: randomUUID(), type: 'EXPENSE', date: '2026-03-05', categoryId, subcategoryId: null, concept: 'Alquiler', merchant: null, amount: '600.00', paymentMethod: null, createdAt: now(), updatedAt: now() },
        ] as never,
        recurringTransactions: [template(templateId, categoryId)] as never,
        recurringOccurrenceResolutions: [
          { recurringId: templateId, occurrenceDate: '2026-03-05', status: 'CONFIRMED', transactionId, createdAt: now() },
          { recurringId: templateId, occurrenceDate: '2026-04-05', status: 'SKIPPED', transactionId: randomUUID(), createdAt: now() },
        ] as never,
      });

      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body.recurringTransactions.toImport).toBe(1);
      expect(res.body.recurringOccurrenceResolutions).toEqual({ total: 2, toImport: 2, alreadyExisting: 0 });

      const [saved] = await db.select().from(recurringTransactions).where(eq(recurringTransactions.userId, user.id));
      expect(saved.id).toBe(templateId);
      const resolutions = await db.select().from(recurringOccurrenceResolutions).where(eq(recurringOccurrenceResolutions.recurringId, templateId));
      expect(resolutions.map((r) => [r.occurrenceDate, r.transactionId])).toEqual(
        expect.arrayContaining([['2026-03-05', transactionId], ['2026-04-05', null]]), // transactionId desconocido → null
      );

      const again = await attach('/data-import/confirm', token, file).expect(201);
      expect(again.body.recurringTransactions.toImport).toBe(0);
      expect(again.body.recurringOccurrenceResolutions.toImport).toBe(0);
      expect(await db.select().from(recurringOccurrenceResolutions)).toHaveLength(2);
    });

    it('una resolución que apunta a una plantilla de otra cuenta no se importa', async () => {
      const owner = await createUser('import-recurrentes-dueno@example.com');
      const [ownerCategory] = await db.insert(categories).values({ userId: owner.id, type: 'EXPENSE', name: 'Vivienda' }).returning();
      const [foreign] = await db
        .insert(recurringTransactions)
        .values({ userId: owner.id, type: 'EXPENSE', categoryId: ownerCategory.id, concept: 'Ajeno', amount: '10.00', frequency: 'MONTHLY', startDate: '2026-01-05' })
        .returning();

      const attacker = await createUser('import-recurrentes-atacante@example.com');
      const token = await login(attacker.email);
      const file = buildFile({
        recurringOccurrenceResolutions: [{ recurringId: foreign.id, occurrenceDate: '2026-03-05', status: 'SKIPPED', transactionId: null, createdAt: now() }] as never,
      });

      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body.recurringOccurrenceResolutions.toImport).toBe(0);
      expect(await db.select().from(recurringOccurrenceResolutions)).toHaveLength(0);
    });
  });

  describe('conciliación de recibos (spec 049 T6.1)', () => {
    const now = () => new Date().toISOString();
    const category = (id: string) => ({ id, userId: randomUUID(), type: 'EXPENSE', name: 'Vivienda', parentId: null, isDefault: false, icon: null, createdAt: now() });
    const template = (id: string, categoryId: string) => ({
      id, userId: randomUUID(), type: 'EXPENSE', categoryId, subcategoryId: null, concept: 'Luz', merchant: null, amount: '50.00',
      paymentMethod: null, frequency: 'MONTHLY', startDate: '2026-01-05', endDate: null, active: true, createdAt: now(), updatedAt: now(),
      variableAmount: true, reminderEnabled: true, reminderDaysBefore: 3,
    });
    const movement = (id: string, categoryId: string, date: string) => ({
      id, userId: randomUUID(), type: 'EXPENSE', date, categoryId, subcategoryId: null, concept: 'IBERDROLA', merchant: null,
      amount: '61.30', paymentMethod: null, createdAt: now(), updatedAt: now(),
    });

    it('importa resoluciones conciliadas, descartes y la configuración nueva de las plantillas; reimportar no duplica', async () => {
      const user = await createUser('import-conciliacion@example.com');
      const token = await login(user.email);
      const categoryId = randomUUID();
      const templateId = randomUUID();
      const reconciledTx = randomUUID();
      const dismissedTx = randomUUID();
      const file = buildFile({
        categories: [category(categoryId)],
        transactions: [movement(reconciledTx, categoryId, '2026-03-04'), movement(dismissedTx, categoryId, '2026-04-06')] as never,
        recurringTransactions: [template(templateId, categoryId)] as never,
        recurringOccurrenceResolutions: [
          { recurringId: templateId, occurrenceDate: '2026-03-05', status: 'RECONCILED', transactionId: reconciledTx, reconciledAutomatically: true, createdAt: now() },
        ] as never,
        recurringReconciliationDismissals: [
          { recurringId: templateId, occurrenceDate: '2026-04-05', transactionId: dismissedTx, createdAt: now() },
        ] as never,
      });

      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body.recurringOccurrenceResolutions).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });
      expect(res.body.recurringReconciliationDismissals).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });

      const [saved] = await db.select().from(recurringTransactions).where(eq(recurringTransactions.userId, user.id));
      expect(saved).toMatchObject({ variableAmount: true, reminderEnabled: true, reminderDaysBefore: 3 });
      const [resolution] = await db.select().from(recurringOccurrenceResolutions).where(eq(recurringOccurrenceResolutions.recurringId, templateId));
      expect(resolution).toMatchObject({ status: 'RECONCILED', transactionId: reconciledTx, reconciledAutomatically: true });
      expect(await db.select().from(recurringReconciliationDismissals)).toHaveLength(1);

      const again = await attach('/data-import/confirm', token, file).expect(201);
      expect(again.body.recurringReconciliationDismissals).toEqual({ total: 1, toImport: 0, alreadyExisting: 1 });
      expect(await db.select().from(recurringReconciliationDismissals)).toHaveLength(1);
    });

    it('un descarte con una plantilla o un movimiento de otra cuenta, o con un movimiento desconocido, no se importa', async () => {
      const owner = await createUser('import-descartes-dueno@example.com');
      const [ownerCategory] = await db.insert(categories).values({ userId: owner.id, type: 'EXPENSE', name: 'Vivienda' }).returning();
      const [foreignTemplate] = await db
        .insert(recurringTransactions)
        .values({ userId: owner.id, type: 'EXPENSE', categoryId: ownerCategory.id, concept: 'Ajeno', amount: '10.00', frequency: 'MONTHLY', startDate: '2026-01-05' })
        .returning();
      const [foreignTx] = await db
        .insert(transactions)
        .values({ userId: owner.id, type: 'EXPENSE', date: '2026-03-05', categoryId: ownerCategory.id, concept: 'Ajeno', amount: '10.00' })
        .returning();

      const attacker = await createUser('import-descartes-atacante@example.com');
      const token = await login(attacker.email);
      const categoryId = randomUUID();
      const ownTemplateId = randomUUID();
      const ownTx = randomUUID();
      const file = buildFile({
        categories: [category(categoryId)],
        transactions: [movement(ownTx, categoryId, '2026-03-05')] as never,
        recurringTransactions: [template(ownTemplateId, categoryId)] as never,
        recurringReconciliationDismissals: [
          { recurringId: foreignTemplate.id, occurrenceDate: '2026-03-05', transactionId: ownTx, createdAt: now() },
          { recurringId: ownTemplateId, occurrenceDate: '2026-03-05', transactionId: foreignTx.id, createdAt: now() },
          { recurringId: ownTemplateId, occurrenceDate: '2026-03-05', transactionId: randomUUID(), createdAt: now() },
        ] as never,
      });

      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body.recurringReconciliationDismissals.toImport).toBe(0);
      expect(await db.select().from(recurringReconciliationDismissals)).toHaveLength(0);
    });

    it('rechaza (400) una resolución con un estado desconocido en vez de fallar al insertar', async () => {
      const user = await createUser('import-estado-raro@example.com');
      const token = await login(user.email);
      const file = buildFile({
        recurringOccurrenceResolutions: [{ recurringId: randomUUID(), occurrenceDate: '2026-03-05', status: 'INVENTADO', transactionId: null, createdAt: now() }] as never,
      });
      await attach('/data-import/confirm', token, file).expect(400);
    });

    it('un fichero anterior a esta spec (sin la clave de descartes) se sigue importando', async () => {
      const user = await createUser('import-sin-descartes@example.com');
      const token = await login(user.email);
      const file = buildFile({ categories: [category(randomUUID())] });
      delete (file.economicData as unknown as Record<string, unknown>).recurringReconciliationDismissals;

      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body.recurringReconciliationDismissals).toEqual({ total: 0, toImport: 0, alreadyExisting: 0 });
    });

    it('la exportación de la cuenta incluye los descartes y no el registro de avisos enviados', async () => {
      const user = await createUser('export-descartes@example.com');
      const token = await login(user.email);
      const [cat] = await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Vivienda' }).returning();
      const [tpl] = await db
        .insert(recurringTransactions)
        .values({ userId: user.id, type: 'EXPENSE', categoryId: cat.id, concept: 'Luz', amount: '50.00', frequency: 'MONTHLY', startDate: '2026-01-05' })
        .returning();
      const [tx] = await db.insert(transactions).values({ userId: user.id, type: 'EXPENSE', date: '2026-03-05', categoryId: cat.id, concept: 'X', amount: '1.00' }).returning();
      await db.insert(recurringReconciliationDismissals).values({ recurringId: tpl.id, occurrenceDate: '2026-03-05', transactionId: tx.id });

      const res = await request(app.getHttpServer()).get('/users/me/export').set('Authorization', `Bearer ${token}`).expect(200);
      const body = (typeof res.body === 'object' && res.body !== null && 'economicData' in res.body ? res.body : JSON.parse(res.text)) as {
        economicData: Record<string, unknown[]>;
      };
      expect(body.economicData.recurringReconciliationDismissals).toEqual([
        expect.objectContaining({ recurringId: tpl.id, occurrenceDate: '2026-03-05', transactionId: tx.id }),
      ]);
      expect(body.economicData).not.toHaveProperty('recurringRemindersSent');
    });
  });

  describe('tickets y listas de la compra (spec 048 T6.1)', () => {
    const now = () => new Date().toISOString();
    const other = () => randomUUID();

    /** Un fichero completo de otra cuenta: comercio, producto, gasto, ticket enlazado con 2 líneas (una sin producto) y una lista. */
    function groceriesFile() {
      const ids = { cat: other(), shop: other(), product: other(), tx: other(), receipt: other(), line1: other(), line2: other(), list: other(), item: other() };
      const file = buildFile({
        categories: [{ id: ids.cat, userId: other(), type: 'EXPENSE', name: 'Comida', parentId: null, isDefault: false, icon: null, createdAt: now() }],
        transactions: [
          { id: ids.tx, userId: other(), type: 'EXPENSE', date: '2026-10-15', categoryId: ids.cat, subcategoryId: null, concept: 'MERCADONA', merchant: null, amount: '3.10', paymentMethod: 'CARD', createdAt: now(), updatedAt: now() },
        ],
        supermarkets: [{ id: ids.shop, userId: other(), name: 'Mercadona', createdAt: now() }],
        products: [{ id: ids.product, userId: other(), name: 'Leche', createdAt: now() }],
        receipts: [{ id: ids.receipt, userId: other(), supermarketId: ids.shop, date: '2026-10-15', printedTotal: '3.10', transactionId: ids.tx, createdAt: now() }],
        receiptLines: [
          { id: ids.line1, receiptId: ids.receipt, productId: ids.product, description: 'LECHE', quantity: '1.000', unit: 'unidad', pricePerUnit: '0.950', amount: '0.95', createdAt: now() },
          { id: ids.line2, receiptId: ids.receipt, productId: null, description: 'BOLSA', quantity: '1.000', unit: 'unidad', pricePerUnit: '2.150', amount: '2.15', createdAt: now() },
        ],
        shoppingLists: [{ id: ids.list, userId: other(), name: 'Semana', createdAt: now() }],
        shoppingListItems: [{ id: ids.item, shoppingListId: ids.list, productId: ids.product, createdAt: now() }],
      });
      return { file, ids };
    }

    it('ida y vuelta en otra cuenta: todo queda bajo el usuario autenticado, con el enlace y la línea sin producto', async () => {
      const user = await createUser('import-tickets@example.com');
      const token = await login(user.email);
      const { file, ids } = groceriesFile();

      const preview = await attach('/data-import/preview', token, file).expect(201);
      expect(preview.body).toMatchObject({
        supermarkets: { toImport: 1 }, products: { toImport: 1 }, receipts: { toImport: 1 },
        receiptLines: { toImport: 2 }, shoppingLists: { toImport: 1 }, shoppingListItems: { toImport: 1 },
      });
      expect(await db.select().from(receipts)).toEqual([]);

      await attach('/data-import/confirm', token, file).expect(201);
      const [receipt] = await db.select().from(receipts).where(eq(receipts.userId, user.id));
      expect(receipt).toMatchObject({ id: ids.receipt, transactionId: ids.tx, supermarketId: ids.shop });
      const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, ids.receipt));
      expect(lines.map((l) => l.productId).sort()).toEqual([ids.product, null].sort());
      expect((await db.select().from(shoppingListItems)).map((i) => i.productId)).toEqual([ids.product]);
      expect((await db.select().from(supermarkets))[0].userId).toBe(user.id);

      const again = await attach('/data-import/confirm', token, file).expect(201);
      expect(again.body).toMatchObject({ receipts: { toImport: 0, alreadyExisting: 1 }, receiptLines: { toImport: 0, alreadyExisting: 2 } });
    });

    it('la exportación incluye los tickets y las listas', async () => {
      const user = await createUser('export-tickets@example.com');
      const token = await login(user.email);
      await attach('/data-import/confirm', token, groceriesFile().file).expect(201);

      const res = await request(app.getHttpServer()).get('/users/me/export').set('Authorization', `Bearer ${token}`).expect(200);
      const data = res.body.economicData as Record<string, unknown[]>;
      for (const key of ['supermarkets', 'products', 'receipts', 'receiptLines', 'shoppingLists', 'shoppingListItems']) {
        expect(data[key]).toHaveLength(key === 'receiptLines' ? 2 : 1);
      }
    });

    it('comprobaciones de propiedad: comercio ajeno → ticket omitido; movimiento ajeno → sin enlace; producto ajeno → línea y elemento omitidos', async () => {
      const owner = await createUser('dueno-tickets@example.com');
      const [ownerCat] = await db.insert(categories).values({ userId: owner.id, type: 'EXPENSE', name: 'Comida' }).returning();
      const [foreignShop] = await db.insert(supermarkets).values({ userId: owner.id, name: 'Ajeno' }).returning();
      const [foreignProduct] = await db.insert(products).values({ userId: owner.id, name: 'Ajeno' }).returning();
      const [foreignTx] = await db.insert(transactions).values({ userId: owner.id, type: 'EXPENSE', date: '2026-10-15', categoryId: ownerCat.id, concept: 'X', amount: '1.00' }).returning();

      const attacker = await createUser('atacante-tickets@example.com');
      const token = await login(attacker.email);
      const ownShop = other();
      const ownReceipt = other();
      const ownList = other();
      const file = buildFile({
        supermarkets: [{ id: ownShop, userId: other(), name: 'Propio', createdAt: now() }],
        receipts: [
          { id: other(), userId: other(), supermarketId: foreignShop.id, date: '2026-10-15', printedTotal: '1.00', transactionId: null, createdAt: now() },
          { id: ownReceipt, userId: other(), supermarketId: ownShop, date: '2026-10-15', printedTotal: '1.00', transactionId: foreignTx.id, createdAt: now() },
        ],
        receiptLines: [
          { id: other(), receiptId: ownReceipt, productId: foreignProduct.id, description: 'X', quantity: '1.000', unit: 'unidad', pricePerUnit: '1.000', amount: '1.00', createdAt: now() },
        ],
        shoppingLists: [{ id: ownList, userId: other(), name: 'Lista', createdAt: now() }],
        shoppingListItems: [{ id: other(), shoppingListId: ownList, productId: foreignProduct.id, createdAt: now() }],
      });

      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body).toMatchObject({ receipts: { total: 2, toImport: 1 }, receiptLines: { toImport: 0 }, shoppingListItems: { toImport: 0 } });
      const imported = await db.select().from(receipts).where(eq(receipts.userId, attacker.id));
      expect(imported).toEqual([expect.objectContaining({ id: ownReceipt, transactionId: null })]);
      expect(await db.select().from(receipts).where(eq(receipts.supermarketId, foreignShop.id))).toEqual([]);
    });

    it('un ticket cuyo id ya existe en otra cuenta no se toca ni se reasigna', async () => {
      const owner = await createUser('dueno-id@example.com');
      const [shop] = await db.insert(supermarkets).values({ userId: owner.id, name: 'Suyo' }).returning();
      const [theirs] = await db.insert(receipts).values({ userId: owner.id, supermarketId: shop.id, date: '2026-10-15', printedTotal: '9.99' }).returning();

      const attacker = await createUser('atacante-id@example.com');
      const token = await login(attacker.email);
      const ownShop = other();
      const file = buildFile({
        supermarkets: [{ id: ownShop, userId: other(), name: 'Propio', createdAt: now() }],
        receipts: [{ id: theirs.id, userId: other(), supermarketId: ownShop, date: '2026-01-01', printedTotal: '0.01', transactionId: null, createdAt: now() }],
        receiptLines: [{ id: other(), receiptId: theirs.id, productId: null, description: 'INYECTADA', quantity: '1.000', unit: 'unidad', pricePerUnit: '1.000', amount: '1.00', createdAt: now() }],
      });

      await attach('/data-import/confirm', token, file).expect(201);
      const [after] = await db.select().from(receipts).where(eq(receipts.id, theirs.id));
      expect(after).toMatchObject({ userId: owner.id, printedTotal: '9.99' });
      expect(await db.select().from(receiptLines).where(eq(receiptLines.receiptId, theirs.id))).toEqual([]);
    });

    it('un fichero anterior a esta spec (sin estas claves) se sigue importando', async () => {
      const user = await createUser('sin-tickets@example.com');
      const token = await login(user.email);
      const file = buildFile({});
      for (const key of ['supermarkets', 'products', 'receipts', 'receiptLines', 'shoppingLists', 'shoppingListItems']) {
        delete (file.economicData as unknown as Record<string, unknown>)[key];
      }
      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body.receipts).toEqual({ total: 0, toImport: 0, alreadyExisting: 0 });
    });
  });

  describe('propiedad de las referencias (spec 050 T2.1)', () => {
    const now = () => new Date().toISOString();
    const categoryRow = (id: string, parentId: string | null = null) => ({
      id, userId: randomUUID(), type: 'EXPENSE', name: `Cat ${id.slice(0, 4)}`, parentId, isDefault: false, icon: null, createdAt: now(),
    });
    const transactionRow = (categoryId: string, subcategoryId: string | null = null) => ({
      id: randomUUID(), userId: randomUUID(), type: 'EXPENSE', date: '2026-10-01', categoryId, subcategoryId, concept: 'Compra', amount: '10.00', createdAt: now(), updatedAt: now(),
    });

    /**
     * Una familia: la tabla padre (raíz, con `userId`), cómo crear un padre
     * en la base de datos para otra cuenta, y una fila hija del fichero que
     * apunta a un padre dado.
     */
    const families = [
      {
        name: 'cuentas bancarias', childKey: 'bankAccountBalances', childTable: bankAccountBalances, column: 'bankAccountId',
        createParent: (userId: string) => db.insert(bankAccounts).values({ userId, bank: 'Banco', accountNumber: 'ES00' }).returning(),
        child: (parentId: string) => ({ id: randomUUID(), bankAccountId: parentId, euros: '100.00', date: '2026-10-01', createdAt: now() }),
      },
      {
        name: 'acciones', childKey: 'stockPurchases', childTable: stockPurchases, column: 'stockId',
        createParent: (userId: string) => db.insert(stocks).values({ userId, custodyBank: 'Broker', stock: 'ACME' }).returning(),
        child: (parentId: string) => ({ id: randomUUID(), stockId: parentId, shareCount: '1', purchasePrice: '5', date: '2026-10-01', createdAt: now(), updatedAt: now() }),
      },
      {
        name: 'fondos', childKey: 'fundSales', childTable: fundSales, column: 'fundId',
        createParent: (userId: string) => db.insert(funds).values({ userId, custodyBank: 'Banco', fund: 'Indexado' }).returning(),
        child: (parentId: string) => ({ id: randomUUID(), fundId: parentId, shareCount: '1', salePrice: '5', date: '2026-10-01', createdAt: now(), updatedAt: now() }),
      },
      {
        name: 'cripto', childKey: 'cryptoPurchases', childTable: cryptoPurchases, column: 'cryptoId',
        createParent: (userId: string) => db.insert(cryptos).values({ userId, exchange: 'Exchange', crypto: 'BTC' }).returning(),
        child: (parentId: string) => ({ id: randomUUID(), cryptoId: parentId, quantity: '1', purchasePrice: '5', date: '2026-10-01', createdAt: now(), updatedAt: now() }),
      },
      {
        name: 'vehículos', childKey: 'vehicleValuations', childTable: vehicleValuations, column: 'vehicleId',
        createParent: (userId: string) =>
          db.insert(vehicles).values({ userId, brandModel: 'Coche', plate: '0000AAA', purchasePrice: '10000', purchaseDate: '2020-01-01' }).returning(),
        child: (parentId: string) => ({ id: randomUUID(), vehicleId: parentId, value: '9000', date: '2026-10-01', createdAt: now(), updatedAt: now() }),
      },
      {
        name: 'planes de pensiones', childKey: 'pensionPlanContributions', childTable: pensionPlanContributions, column: 'pensionPlanId',
        createParent: (userId: string) => db.insert(pensionPlans).values({ userId, managingEntity: 'Gestora', plan: 'Plan' }).returning(),
        child: (parentId: string) => ({ id: randomUUID(), pensionPlanId: parentId, amount: '100', date: '2026-10-01', createdAt: now(), updatedAt: now() }),
      },
      {
        name: 'efectivo', childKey: 'cashBalances', childTable: cashBalances, column: 'cashHoldingId',
        createParent: (userId: string) => db.insert(cashHoldings).values({ userId, location: 'Casa' }).returning(),
        child: (parentId: string) => ({ id: randomUUID(), cashHoldingId: parentId, amount: '50', date: '2026-10-01', createdAt: now() }),
      },
      {
        name: 'categorías (movimientos)', childKey: 'transactions', childTable: transactions, column: 'categoryId',
        createParent: (userId: string) => db.insert(categories).values({ userId, type: 'EXPENSE', name: 'Ajena' }).returning(),
        child: (parentId: string) => transactionRow(parentId),
      },
      {
        name: 'categorías (presupuestos)', childKey: 'expenseBudgets', childTable: expenseBudgets, column: 'categoryId',
        createParent: (userId: string) => db.insert(categories).values({ userId, type: 'EXPENSE', name: 'Ajena' }).returning(),
        child: (parentId: string) => ({
          id: randomUUID(), userId: randomUUID(), categoryId: parentId, targetType: 'AMOUNT', targetValue: '100', alertThresholdPercent: '80', createdAt: now(), updatedAt: now(),
        }),
      },
    ] as const;

    for (const family of families) {
      it(`${family.name}: una fila que apunta a un padre de otra cuenta o desconocido se omite y no toca la otra cuenta`, async () => {
        const ana = await createUser('ana-refs@example.com');
        const bea = await createUser('bea-refs@example.com');
        const [beaParent] = await family.createParent(bea.id);
        const foreign = family.child(beaParent.id);
        const unknown = family.child(randomUUID());
        const file = buildFile({ [family.childKey]: [foreign, unknown] });
        const token = await login(ana.email);

        const preview = await attach('/data-import/preview', token, file).expect(201);
        const res = await attach('/data-import/confirm', token, file).expect(201);
        expect(res.body[family.childKey]).toEqual({ total: 2, toImport: 0, alreadyExisting: 0, omitted: 2 });
        expect(preview.body[family.childKey]).toEqual(res.body[family.childKey]);

        const table = family.childTable as unknown as typeof stockPurchases;
        const column = (family.childTable as unknown as Record<string, typeof stockPurchases.stockId>)[family.column];
        expect(await db.select().from(table).where(eq(column, beaParent.id))).toEqual([]);
      });

      it(`${family.name}: con el padre en el fichero o ya en la cuenta, se importa`, async () => {
        const ana = await createUser('ana-refs-ok@example.com');
        const [ownParent] = await family.createParent(ana.id);
        const file = buildFile({ [family.childKey]: [family.child(ownParent.id)] });
        const res = await attach('/data-import/confirm', await login(ana.email), file).expect(201);
        expect(res.body[family.childKey]).toEqual({ total: 1, toImport: 1, alreadyExisting: 0, omitted: 0 });
      });
    }

    it('subcategoría ajena o desconocida: el movimiento se importa sin subcategoría', async () => {
      const ana = await createUser('ana-subcat@example.com');
      const bea = await createUser('bea-subcat@example.com');
      const [beaSub] = await db.insert(categories).values({ userId: bea.id, type: 'EXPENSE', name: 'Ajena' }).returning();
      const ownCategory = categoryRow(randomUUID());
      const withForeign = transactionRow(ownCategory.id, beaSub.id);
      const withUnknown = transactionRow(ownCategory.id, randomUUID());
      const file = buildFile({ categories: [ownCategory], transactions: [withForeign, withUnknown] });

      const res = await attach('/data-import/confirm', await login(ana.email), file).expect(201);
      expect(res.body.transactions).toEqual({ total: 2, toImport: 2, alreadyExisting: 0, omitted: 0 });
      const rows = await db.select().from(transactions).where(eq(transactions.userId, ana.id));
      expect(rows.map((r) => r.subcategoryId)).toEqual([null, null]);
      expect(rows.every((r) => r.categoryId === ownCategory.id)).toBe(true);
    });

    it('una categoría hija con padre ajeno se omite, y con ella el movimiento que cuelga de ella', async () => {
      const ana = await createUser('ana-cat-hija@example.com');
      const bea = await createUser('bea-cat-hija@example.com');
      const [beaParent] = await db.insert(categories).values({ userId: bea.id, type: 'EXPENSE', name: 'Ajena' }).returning();
      const child = categoryRow(randomUUID(), beaParent.id);
      const ownRoot = categoryRow(randomUUID());
      const ownChild = categoryRow(randomUUID(), ownRoot.id);
      const file = buildFile({
        categories: [child, ownRoot, ownChild],
        transactions: [transactionRow(child.id), transactionRow(ownChild.id)],
      });
      const token = await login(ana.email);

      const preview = await attach('/data-import/preview', token, file).expect(201);
      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(res.body.categories).toEqual({ total: 3, toImport: 2, alreadyExisting: 0, omitted: 1 });
      expect(res.body.transactions).toEqual({ total: 2, toImport: 1, alreadyExisting: 0, omitted: 1 });
      expect(preview.body).toEqual(res.body);
      expect(await db.select().from(categories).where(eq(categories.parentId, beaParent.id))).toEqual([]);
    });

    it('un padre del fichero cuyo id ya es de otra cuenta no se importa, y sus hijas se omiten', async () => {
      const ana = await createUser('ana-padre-ajeno@example.com');
      const bea = await createUser('bea-padre-ajeno@example.com');
      const [beaStock] = await db.insert(stocks).values({ userId: bea.id, custodyBank: 'Broker', stock: 'Ajena' }).returning();
      const file = buildFile({
        stocks: [{ id: beaStock.id, userId: ana.id, custodyBank: 'Broker', stock: 'Mía', createdAt: now(), updatedAt: now() }],
        stockPurchases: [families[1].child(beaStock.id)],
      });

      const res = await attach('/data-import/confirm', await login(ana.email), file).expect(201);
      expect(res.body.stocks).toEqual({ total: 1, toImport: 0, alreadyExisting: 1 });
      expect(res.body.stockPurchases).toEqual({ total: 1, toImport: 0, alreadyExisting: 0, omitted: 1 });
      expect(await db.select().from(stockPurchases).where(eq(stockPurchases.stockId, beaStock.id))).toEqual([]);
      const [stillBeas] = await db.select().from(stocks).where(eq(stocks.id, beaStock.id));
      expect(stillBeas).toMatchObject({ userId: bea.id, stock: 'Ajena' });
    });

    it('una plantilla recurrente con categoría ajena se omite; con subcategoría ajena se importa sin ella', async () => {
      const ana = await createUser('ana-plantilla@example.com');
      const bea = await createUser('bea-plantilla@example.com');
      const [beaCat] = await db.insert(categories).values({ userId: bea.id, type: 'EXPENSE', name: 'Ajena' }).returning();
      const own = categoryRow(randomUUID());
      const template = (categoryId: string, subcategoryId: string | null) => ({
        id: randomUUID(), userId: randomUUID(), type: 'EXPENSE', categoryId, subcategoryId, concept: 'Luz', amount: '50.00', frequency: 'MONTHLY',
        startDate: '2026-01-01', createdAt: now(), updatedAt: now(),
      });
      const file = buildFile({ categories: [own], recurringTransactions: [template(beaCat.id, null), template(own.id, beaCat.id)] });

      const res = await attach('/data-import/confirm', await login(ana.email), file).expect(201);
      expect(res.body.recurringTransactions).toEqual({ total: 2, toImport: 1, alreadyExisting: 0, omitted: 1 });
      const rows = await db.select().from(recurringTransactions).where(eq(recurringTransactions.userId, ana.id));
      expect(rows).toMatchObject([{ categoryId: own.id, subcategoryId: null }]);
    });

    it('una referencia que no es un UUID se trata como desconocida, sin 500', async () => {
      const ana = await createUser('ana-no-uuid@example.com');
      const file = buildFile({ stockPurchases: [families[1].child('no-es-un-uuid')] });
      const res = await attach('/data-import/confirm', await login(ana.email), file).expect(201);
      expect(res.body.stockPurchases).toMatchObject({ toImport: 0, omitted: 1 });
    });
  });

  describe('fusiones de las specs 047, 048 y 049 con el mismo registro (spec 050 T2.2)', () => {
    const now = () => new Date().toISOString();

    it('lo que cuelga de una plantilla o un movimiento omitidos por su categoría ajena se omite o pierde el enlace, sin 500', async () => {
      const ana = await createUser('ana-t22@example.com');
      const bea = await createUser('bea-t22@example.com');
      const [beaCat] = await db.insert(categories).values({ userId: bea.id, type: 'EXPENSE', name: 'Ajena' }).returning();
      const templateId = randomUUID();
      const txId = randomUUID();
      const shopId = randomUUID();
      const receiptId = randomUUID();
      const file = buildFile({
        // Plantilla y movimiento del fichero, pero con una categoría de Bea: se omiten (T2.1).
        recurringTransactions: [{
          id: templateId, userId: ana.id, type: 'EXPENSE', categoryId: beaCat.id, subcategoryId: null, concept: 'Luz', amount: '50.00', frequency: 'MONTHLY',
          startDate: '2026-01-01', createdAt: now(), updatedAt: now(),
        }],
        transactions: [{
          id: txId, userId: ana.id, type: 'EXPENSE', date: '2026-03-05', categoryId: beaCat.id, subcategoryId: null, concept: 'IBERDROLA', amount: '50.00',
          createdAt: now(), updatedAt: now(),
        }],
        recurringOccurrenceResolutions: [{ recurringId: templateId, occurrenceDate: '2026-03-05', status: 'CONFIRMED', transactionId: txId, createdAt: now() }],
        recurringReconciliationDismissals: [{ recurringId: templateId, occurrenceDate: '2026-04-05', transactionId: txId, createdAt: now() }],
        supermarkets: [{ id: shopId, userId: ana.id, name: 'Iberdrola', createdAt: now() }],
        receipts: [{ id: receiptId, userId: ana.id, supermarketId: shopId, date: '2026-03-05', printedTotal: '50.00', transactionId: txId, createdAt: now() }],
      });
      const token = await login(ana.email);

      const preview = await attach('/data-import/preview', token, file).expect(201);
      const res = await attach('/data-import/confirm', token, file).expect(201);
      expect(preview.body).toEqual(res.body);
      expect(res.body.recurringTransactions).toMatchObject({ toImport: 0, omitted: 1 });
      expect(res.body.transactions).toMatchObject({ toImport: 0, omitted: 1 });
      expect(res.body.recurringOccurrenceResolutions).toEqual({ total: 1, toImport: 0, alreadyExisting: 0 });
      expect(res.body.recurringReconciliationDismissals).toEqual({ total: 1, toImport: 0, alreadyExisting: 0 });
      // El ticket se importa, pero sin el enlace al movimiento omitido.
      expect(res.body.receipts).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });
      const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
      expect(receipt).toMatchObject({ userId: ana.id, transactionId: null });
    });

    it('las líneas y los elementos de lista que apuntan a un ticket o producto omitidos se omiten', async () => {
      const ana = await createUser('ana-t22-lineas@example.com');
      const bea = await createUser('bea-t22-lineas@example.com');
      const [beaShop] = await db.insert(supermarkets).values({ userId: bea.id, name: 'Ajeno' }).returning();
      const [beaProduct] = await db.insert(products).values({ userId: bea.id, name: 'Ajeno' }).returning();
      const receiptId = randomUUID();
      const listId = randomUUID();
      const file = buildFile({
        // El comercio y el producto vienen en el fichero, pero con id de Bea: no se importan.
        supermarkets: [{ id: beaShop.id, userId: ana.id, name: 'Mío', createdAt: now() }],
        products: [{ id: beaProduct.id, userId: ana.id, name: 'Mío', createdAt: now() }],
        receipts: [{ id: receiptId, userId: ana.id, supermarketId: beaShop.id, date: '2026-03-05', printedTotal: '1.00', transactionId: null, createdAt: now() }],
        receiptLines: [{
          id: randomUUID(), receiptId, productId: null, description: 'X', quantity: '1', unit: 'ud', pricePerUnit: '1.000', amount: '1.00', createdAt: now(),
        }],
        shoppingLists: [{ id: listId, userId: ana.id, name: 'Semana', createdAt: now() }],
        shoppingListItems: [{ id: randomUUID(), shoppingListId: listId, productId: beaProduct.id, createdAt: now() }],
      });

      const res = await attach('/data-import/confirm', await login(ana.email), file).expect(201);
      expect(res.body.receipts).toEqual({ total: 1, toImport: 0, alreadyExisting: 0 });
      expect(res.body.receiptLines).toEqual({ total: 1, toImport: 0, alreadyExisting: 0 });
      expect(res.body.shoppingLists).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });
      expect(res.body.shoppingListItems).toEqual({ total: 1, toImport: 0, alreadyExisting: 0 });
      expect(await db.select().from(receipts).where(eq(receipts.userId, ana.id))).toEqual([]);
    });
  });

  describe('datos no válidos (spec 050 T3.1)', () => {
    const now = () => new Date().toISOString();
    const category = (id: string) => ({ id, userId: randomUUID(), type: 'EXPENSE', name: 'Compra', parentId: null, isDefault: false, icon: null, createdAt: now() });
    const movement = (categoryId: string, overrides: Record<string, unknown> = {}) => ({
      id: randomUUID(), userId: randomUUID(), type: 'EXPENSE', date: '2026-10-01', categoryId, subcategoryId: null, concept: 'Compra', amount: '10.00',
      createdAt: now(), updatedAt: now(), ...overrides,
    });

    for (const [name, overrides] of [
      ['un importe no numérico', { amount: 'diez euros' }],
      ['un tipo que no existe', { type: 'REGALO' }],
      ['una fecha imposible', { date: '2026-13-45' }],
      ['una fecha de creación imposible', { createdAt: 'ayer' }],
    ] as const) {
      it(`${name} → 400 con un mensaje claro y no se escribe nada, tampoco las filas válidas`, async () => {
        const ana = await createUser('ana-datos@example.com');
        const catId = randomUUID();
        const file = buildFile({ categories: [category(catId)], transactions: [movement(catId), movement(catId, overrides)] });

        const res = await attach('/data-import/confirm', await login(ana.email), file).expect(400);
        expect(res.body.message).toBe('El fichero contiene datos que no se pueden importar.');
        expect(await db.select().from(categories).where(eq(categories.userId, ana.id))).toEqual([]);
        expect(await db.select().from(transactions).where(eq(transactions.userId, ana.id))).toEqual([]);
      });
    }
  });

  describe('ida y vuelta completa y ventas de fondos (spec 050 T4.1)', () => {
    it('una copia exportada por la app se restaura entera en una cuenta vacía, sin ningún omitido, con las ventas de fondos', async () => {
      const ana = await createUser('ana-ida-vuelta@example.com');
      const [root] = await db.insert(categories).values({ userId: ana.id, type: 'EXPENSE', name: 'Casa' }).returning();
      const [child] = await db.insert(categories).values({ userId: ana.id, type: 'EXPENSE', name: 'Luz', parentId: root.id }).returning();
      await db.insert(transactions).values({ userId: ana.id, type: 'EXPENSE', date: '2026-10-01', categoryId: root.id, subcategoryId: child.id, concept: 'Luz', amount: '50.00' });
      await db.insert(expenseBudgets).values({ userId: ana.id, categoryId: root.id, targetType: 'AMOUNT', targetValue: '300', alertThresholdPercent: '80' });
      await db.insert(recurringTransactions).values({
        userId: ana.id, type: 'EXPENSE', categoryId: root.id, subcategoryId: child.id, concept: 'Luz', amount: '50.00', frequency: 'MONTHLY', startDate: '2026-01-01',
      });
      const [account] = await db.insert(bankAccounts).values({ userId: ana.id, bank: 'Banco', accountNumber: 'ES00' }).returning();
      await db.insert(bankAccountBalances).values({ bankAccountId: account.id, euros: '1000', date: '2026-10-01' });
      const [stock] = await db.insert(stocks).values({ userId: ana.id, custodyBank: 'Broker', stock: 'ACME' }).returning();
      await db.insert(stockPurchases).values({ stockId: stock.id, shareCount: '10', purchasePrice: '5', date: '2026-01-01' });
      const [fund] = await db.insert(funds).values({ userId: ana.id, custodyBank: 'Banco', fund: 'Indexado' }).returning();
      await db.insert(fundPurchases).values({ fundId: fund.id, shareCount: '10', purchasePrice: '10', date: '2026-01-01' });
      await db.insert(fundSales).values({ fundId: fund.id, shareCount: '4', salePrice: '12', date: '2026-06-01' });
      const [crypto] = await db.insert(cryptos).values({ userId: ana.id, exchange: 'Exchange', crypto: 'BTC' }).returning();
      await db.insert(cryptoPurchases).values({ cryptoId: crypto.id, quantity: '0.1', purchasePrice: '30000', date: '2026-01-01' });
      const [vehicle] = await db.insert(vehicles).values({ userId: ana.id, brandModel: 'Coche', plate: '0000AAA', purchasePrice: '10000', purchaseDate: '2020-01-01' }).returning();
      await db.insert(vehicleValuations).values({ vehicleId: vehicle.id, value: '8000', date: '2026-01-01' });
      const [plan] = await db.insert(pensionPlans).values({ userId: ana.id, managingEntity: 'Gestora', plan: 'Plan' }).returning();
      await db.insert(pensionPlanContributions).values({ pensionPlanId: plan.id, amount: '100', date: '2026-01-01' });
      const [cash] = await db.insert(cashHoldings).values({ userId: ana.id, location: 'Casa' }).returning();
      await db.insert(cashBalances).values({ cashHoldingId: cash.id, amount: '50', date: '2026-01-01' });

      const exported = await request(app.getHttpServer()).get('/users/me/export').set('Authorization', `Bearer ${await login(ana.email)}`).expect(200);
      await db.delete(recurringTransactions).where(eq(recurringTransactions.userId, ana.id));
      await db.delete(users).where(eq(users.id, ana.id));

      const bea = await createUser('bea-ida-vuelta@example.com');
      const res = await attach('/data-import/confirm', await login(bea.email), exported.body).expect(201);
      for (const [key, summary] of Object.entries(res.body as Record<string, { total: number; toImport: number; omitted?: number }>)) {
        expect({ key, toImport: summary.toImport, omitted: summary.omitted ?? 0 }).toEqual({ key, toImport: summary.total, omitted: 0 });
      }
      expect(res.body.fundSales).toEqual({ total: 1, toImport: 1, alreadyExisting: 0, omitted: 0 });
      expect(res.body.categories.toImport).toBe(2);
      const [sale] = await db.select().from(fundSales).where(eq(fundSales.fundId, fund.id));
      expect(sale).toMatchObject({ shareCount: '4.00000000', date: '2026-06-01' });
      const [restoredFund] = await db.select().from(funds).where(eq(funds.id, fund.id));
      expect(restoredFund.userId).toBe(bea.id);
    });

    it('una copia antigua sin ventas de fondos se sigue importando', async () => {
      const ana = await createUser('ana-sin-ventas@example.com');
      const fundId = randomUUID();
      const file = buildFile({ funds: [{ id: fundId, userId: randomUUID(), custodyBank: 'Banco', fund: 'Indexado', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
      delete (file.economicData as unknown as Record<string, unknown>).fundSales;

      const res = await attach('/data-import/confirm', await login(ana.email), file).expect(201);
      expect(res.body.funds.toImport).toBe(1);
      expect(res.body.fundSales).toEqual({ total: 0, toImport: 0, alreadyExisting: 0, omitted: 0 });
    });
  });
});
