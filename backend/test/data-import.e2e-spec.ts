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
import { categories, stockPurchases, stocks, transactions, users } from '../src/db/schema/index.js';
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
});
