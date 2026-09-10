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
import { stockPurchases, stockSales, stockValuations, stocks, users } from '../src/db/schema/index.js';

/** CSVs sintéticos, nunca el fichero real de Diego (plan.md §13). */
function csvLine(cells: string[]): string {
  return cells.map((c) => `"${c}"`).join(',');
}

function buildCsv(options: { summary?: string[][]; open?: string[][]; closed?: string[][]; omitSection?: 'summary' | 'open' | 'closed' }): Buffer {
  const blocks: string[] = [];

  if (options.omitSection !== 'summary') {
    blocks.push(csvLine(['Resumen de posiciones']));
    blocks.push(csvLine(['', 'Nombre', 'Símbolo', 'Precio actual']));
    for (const row of options.summary ?? []) blocks.push(csvLine(['', ...row]));
    blocks.push('""');
  }

  if (options.omitSection !== 'open') {
    blocks.push(csvLine(['Posiciones abiertas']));
    blocks.push(csvLine(['', 'Nombre', 'Símbolo', 'Fecha apertura', 'Cantidad', 'Precio entrada']));
    for (const row of options.open ?? []) blocks.push(csvLine(['', ...row]));
    blocks.push('""');
  }

  if (options.omitSection !== 'closed') {
    blocks.push(csvLine(['Posiciones cerradas']));
    blocks.push(csvLine(['', 'Nombre', 'Símbolo', 'F. apertura', 'Cantidad', 'Precio entrada', 'Fecha cierre', 'Precio cierre']));
    for (const row of options.closed ?? []) blocks.push(csvLine(['', ...row]));
    blocks.push('""');
  }

  return Buffer.from(blocks.join('\n'), 'utf-8');
}

describe('Importar acciones desde CSV (e2e) — spec 033', () => {
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

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function attach(url: string, token: string, csv: Buffer) {
    return request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).attach('file', csv, 'cartera.csv');
  }

  it('sin autenticar, responde 401 en preview y confirm', async () => {
    const csv = buildCsv({});
    await request(app.getHttpServer()).post('/stock-import/preview').attach('file', csv, 'cartera.csv').expect(401);
    await request(app.getHttpServer()).post('/stock-import/confirm').attach('file', csv, 'cartera.csv').expect(401);
  });

  it('con la cuenta sin verificar, responde 403', async () => {
    const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
    const token = await login(user.email);
    await attach('/stock-import/preview', token, buildCsv({})).expect(403);
  });

  it('fichero sin la sección "Resumen de posiciones" → 400, nada escrito', async () => {
    const user = await createUser('sin-seccion@example.com');
    const token = await login(user.email);
    const csv = buildCsv({ omitSection: 'summary', open: [['Repsol', 'REP', '09/04/2025', '260.00000000', '9,607']] });

    const res = await attach('/stock-import/confirm', token, csv).expect(400);
    expect(res.body.message).toMatch(/Resumen de posiciones/);

    const rows = await db.select().from(stocks).where(eq(stocks.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it('preview: nueva, ya existente y ambigua se calculan bien sin escribir nada', async () => {
    const user = await createUser('preview-tres-estados@example.com');
    const token = await login(user.email);

    // "Repsol" ya existe (coincidencia única) — se reutiliza su banco custodia.
    await db.insert(stocks).values({ userId: user.id, custodyBank: 'MyInvestor', stock: 'Repsol' });
    // "Santander" es ambigua: dos posiciones ya existentes con el mismo nombre.
    await db.insert(stocks).values({ userId: user.id, custodyBank: 'MyInvestor', stock: 'Santander' });
    await db.insert(stocks).values({ userId: user.id, custodyBank: 'DEGIRO', stock: 'Santander' });

    const csv = buildCsv({
      summary: [['Repsol', 'REP', '29,120']],
      open: [
        ['Repsol', 'REP', '09/04/2025', '260.00000000', '9,607'],
        ['Santander', 'SAN', '29/09/2022', '37.00000000', '2,3667'],
        ['BBVA', 'BBVA', '09/06/2022', '700.00000000', '4,363'],
      ],
    });

    const res = await attach('/stock-import/preview', token, csv).expect(201);
    const byName = Object.fromEntries(res.body.stocks.map((r: { name: string }) => [r.name, r]));

    expect(byName.Repsol).toMatchObject({ status: 'existing', custodyBank: 'MyInvestor' });
    expect(byName.Repsol.purchases).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });
    expect(byName.Repsol.valuations).toEqual({ total: 1, toImport: 1, alreadyExisting: 0 });
    expect(byName.Santander).toMatchObject({ status: 'ambiguous', custodyBank: null });
    expect(byName.BBVA).toMatchObject({ status: 'new', custodyBank: '-' });
    expect(res.body.totals).toEqual({ newStocks: 1, existingStocks: 1, ambiguousStocks: 1 });

    // Nada se ha escrito todavía.
    const allStocks = await db.select().from(stocks).where(eq(stocks.userId, user.id));
    expect(allStocks).toHaveLength(3); // las 3 ya existentes de antes (Repsol + Santander x2), ninguna nueva
    const purchases = await db.select().from(stockPurchases);
    expect(purchases).toHaveLength(0);
  });

  it('confirm: importa compras, ventas y valoraciones; la fila ambigua no inserta nada', async () => {
    const user = await createUser('confirm-completo@example.com');
    const token = await login(user.email);
    await db.insert(stocks).values({ userId: user.id, custodyBank: 'MyInvestor', stock: 'Santander' });
    await db.insert(stocks).values({ userId: user.id, custodyBank: 'DEGIRO', stock: 'Santander' });

    const csv = buildCsv({
      summary: [['Repsol', 'REP', '29,120']],
      open: [['Repsol', 'REP', '09/04/2025', '260.00000000', '9,607']],
      closed: [
        ['Amadeus', 'AMA', '08/07/2026', '50.00000000', '50,160', '08/09/2026', '55,720'],
        ['Santander', 'SAN', '14/12/2019', '812.00000000', '3,66', '27/01/2026', '10,7040'],
      ],
    });

    const res = await attach('/stock-import/confirm', token, csv).expect(201);
    expect(res.body.totals).toEqual({ newStocks: 2, existingStocks: 0, ambiguousStocks: 1 });

    const repsol = await db.query.stocks.findFirst({ where: eq(stocks.stock, 'Repsol') });
    expect(repsol).toBeDefined();
    const repsolPurchases = await db.select().from(stockPurchases).where(eq(stockPurchases.stockId, repsol!.id));
    expect(repsolPurchases).toHaveLength(1);
    const repsolValuations = await db.select().from(stockValuations).where(eq(stockValuations.stockId, repsol!.id));
    expect(repsolValuations).toHaveLength(1);

    const amadeus = await db.query.stocks.findFirst({ where: eq(stocks.stock, 'Amadeus') });
    expect(amadeus).toBeDefined();
    const amadeusPurchases = await db.select().from(stockPurchases).where(eq(stockPurchases.stockId, amadeus!.id));
    expect(amadeusPurchases).toHaveLength(1);
    const amadeusSales = await db.select().from(stockSales).where(eq(stockSales.stockId, amadeus!.id));
    expect(amadeusSales).toHaveLength(1);
    // "Posiciones cerradas" no trae valoración de una acción sin posición abierta hoy.
    const amadeusValuations = await db.select().from(stockValuations).where(eq(stockValuations.stockId, amadeus!.id));
    expect(amadeusValuations).toHaveLength(0);

    // La fila ambigua ("Santander") no crea ninguna acción ni compra/venta nueva.
    const stocksNamedSantander = await db.select().from(stocks).where(eq(stocks.stock, 'Santander'));
    expect(stocksNamedSantander).toHaveLength(2); // las 2 de antes, sin cambios
    for (const s of stocksNamedSantander) {
      const sales = await db.select().from(stockSales).where(eq(stockSales.stockId, s.id));
      expect(sales).toHaveLength(0);
    }
  });

  it('reimportar el mismo fichero dos veces seguidas no duplica nada', async () => {
    const user = await createUser('reimportar@example.com');
    const token = await login(user.email);
    const csv = buildCsv({
      summary: [['Repsol', 'REP', '29,120']],
      open: [['Repsol', 'REP', '09/04/2025', '260.00000000', '9,607']],
    });

    const first = await attach('/stock-import/confirm', token, csv).expect(201);
    expect(first.body.totals).toEqual({ newStocks: 1, existingStocks: 0, ambiguousStocks: 0 });

    const second = await attach('/stock-import/confirm', token, csv).expect(201);
    expect(second.body.totals).toEqual({ newStocks: 0, existingStocks: 1, ambiguousStocks: 0 });
    const repsolRow = second.body.stocks.find((r: { name: string }) => r.name === 'Repsol');
    expect(repsolRow.purchases).toEqual({ total: 1, toImport: 0, alreadyExisting: 1 });
    expect(repsolRow.valuations).toEqual({ total: 1, toImport: 0, alreadyExisting: 1 });

    const allStocks = await db.select().from(stocks).where(eq(stocks.userId, user.id));
    expect(allStocks).toHaveLength(1);
    const purchases = await db.select().from(stockPurchases).where(eq(stockPurchases.stockId, allStocks[0].id));
    expect(purchases).toHaveLength(1);
  });

  it('un nombre de acción que excede el límite de columna hace fallar toda la transacción (todo o nada)', async () => {
    const user = await createUser('todo-o-nada@example.com');
    const token = await login(user.email);
    const tooLongName = 'A'.repeat(200); // stocks.stock es varchar(150)
    const csv = buildCsv({
      open: [
        ['Repsol', 'REP', '09/04/2025', '260.00000000', '9,607'],
        [tooLongName, 'X', '09/04/2025', '1.00000000', '1,00'],
      ],
    });

    await attach('/stock-import/confirm', token, csv).expect(400);

    const rows = await db.select().from(stocks).where(eq(stocks.userId, user.id));
    expect(rows).toHaveLength(0); // ni siquiera "Repsol", que por sí sola habría sido válida
  });

  it('el emparejamiento y la escritura solo tocan acciones del usuario autenticado (aislamiento)', async () => {
    const owner = await createUser('aislamiento-dueno@example.com');
    const other = await createUser('aislamiento-otro@example.com');
    await db.insert(stocks).values({ userId: other.id, custodyBank: 'BancoDeOtro', stock: 'Repsol' });
    const token = await login(owner.email);

    const csv = buildCsv({ open: [['Repsol', 'REP', '09/04/2025', '260.00000000', '9,607']] });
    const res = await attach('/stock-import/confirm', token, csv).expect(201);

    // No se empareja con la "Repsol" de otro usuario — se crea una nueva, propia.
    expect(res.body.stocks[0]).toMatchObject({ status: 'new', custodyBank: '-' });
    const ownerStocks = await db.select().from(stocks).where(eq(stocks.userId, owner.id));
    expect(ownerStocks).toHaveLength(1);
    const otherStocks = await db.select().from(stocks).where(eq(stocks.userId, other.id));
    expect(otherStocks).toHaveLength(1); // sin cambios
  });
});
