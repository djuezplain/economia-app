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
  categories,
  recurringOccurrenceResolutions,
  recurringReconciliationDismissals,
  recurringTransactions,
  stockPurchases,
  stocks,
  transactions,
  users,
} from '../src/db/schema/index.js';
import { ECONOMIC_DATA_TABLE_ORDER, EXPORT_FORMAT_VERSION } from '../src/data-export/account-export.types.js';
import type { EconomicData } from '../src/data-export/account-export.types.js';

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
    await app.close();
  });

  beforeEach(async () => {
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
    expect(res.body.categories).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });
    expect(res.body.transactions).toEqual({ total: 0, toImport: 0, alreadyExisting: 0 });

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
    expect(res.body.stockPurchases).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });

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

    expect(second.body.categories).toEqual({ total: 1, toImport: 0, alreadyExisting: 1 });
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
      expect(res.body.recurringTransactions).toEqual({ total: 0, toImport: 0, alreadyExisting: 0 });
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
});
