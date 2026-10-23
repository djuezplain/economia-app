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
import { categories, receiptLines, receipts, supermarkets, transactions, users } from '../src/db/schema/index.js';

/** Spec 048 H3: enlace entre un ticket y su movimiento. */
describe('Enlace ticket ↔ movimiento (e2e) — spec 048 H3', () => {
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

  const server = () => app.getHttpServer();

  /** Usuario con un ticket de Mercadona del 15/10/2026: total impreso 39,27 y líneas que suman 38,90. */
  async function setup(email = 'ana@example.com') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    const res = await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    const [category] = await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Comida' }).returning();
    const [shop] = await db.insert(supermarkets).values({ userId: user.id, name: 'MERCADONA, S.A.' }).returning();
    const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: shop.id, date: '2026-10-15', printedTotal: '39.27' }).returning();
    await db.insert(receiptLines).values({ receiptId: receipt.id, productId: null, description: 'VARIOS', quantity: '1', unit: 'unidad', pricePerUnit: '38.900', amount: '38.90' });
    const movement = async (date: string, amount: string, extra: Partial<typeof transactions.$inferInsert> = {}) =>
      (
        await db
          .insert(transactions)
          .values({ userId: user.id, type: 'EXPENSE', date, categoryId: category.id, concept: 'Compra', amount, ...extra })
          .returning()
      )[0];
    return { user, token: `Bearer ${res.body.accessToken as string}`, category, receipt, movement };
  }

  const candidates = (token: string, receiptId: string) =>
    request(server()).get(`/receipts/${receiptId}/transaction-candidates`).set('Authorization', token).expect(200);
  const link = (token: string, receiptId: string, transactionId: string) =>
    request(server()).put(`/receipts/${receiptId}/transaction`).set('Authorization', token).send({ transactionId });

  it('candidatos: por total impreso o por suma de líneas, en la ventana de fechas, ordenados por comercio', async () => {
    const { token, receipt, movement, category, user } = await setup();
    const porTotalOtroComercio = await movement('2026-10-15', '39.27', { merchant: 'CARREFOUR' });
    const porLineasMercadona = await movement('2026-10-17', '38.90', { concept: 'COMPRA TARJ MERCADONA VALENCIA' });
    await movement('2026-10-12', '39.27'); // 3 días antes: fuera
    await movement('2026-10-21', '39.27'); // 6 días después: fuera
    await movement('2026-10-15', '40.00'); // otro importe
    await db.insert(transactions).values({ userId: user.id, type: 'INCOME', date: '2026-10-15', categoryId: category.id, concept: 'Devolución', amount: '39.27' });

    const res = await candidates(token, receipt.id);
    expect((res.body as Array<{ id: string }>).map((m) => m.id)).toEqual([porLineasMercadona.id, porTotalOtroComercio.id]);
  });

  it('un movimiento ya enlazado a otro ticket no sale como candidato', async () => {
    const { token, receipt, movement, user } = await setup();
    const m = await movement('2026-10-15', '39.27');
    const [otro] = await db.insert(receipts).values({ userId: user.id, supermarketId: receipt.supermarketId, date: '2026-10-15', printedTotal: '39.27', transactionId: m.id }).returning();
    expect(otro.transactionId).toBe(m.id);
    expect((await candidates(token, receipt.id)).body).toEqual([]);
  });

  it('enlazar, verlo desde el ticket y desde el movimiento, cambiar y quitar', async () => {
    const { token, receipt, movement } = await setup();
    const a = await movement('2026-10-15', '39.27');
    const b = await movement('2026-10-16', '39.27');

    const linked = await link(token, receipt.id, a.id).expect(200);
    expect(linked.body.transactionId).toBe(a.id);
    const one = await request(server()).get(`/transactions/${a.id}`).set('Authorization', token).expect(200);
    expect(one.body.receiptId).toBe(receipt.id);
    const list = await request(server()).get('/transactions?dateFrom=2026-10-15&dateTo=2026-10-16').set('Authorization', token).expect(200);
    expect(Object.fromEntries((list.body.items as Array<{ id: string; receiptId: string | null }>).map((t) => [t.id, t.receiptId]))).toEqual({ [a.id]: receipt.id, [b.id]: null });

    await link(token, receipt.id, b.id).expect(200);
    expect((await request(server()).get(`/transactions/${a.id}`).set('Authorization', token)).body.receiptId).toBeNull();

    await request(server()).delete(`/receipts/${receipt.id}/transaction`).set('Authorization', token).expect(204);
    expect((await request(server()).get(`/receipts/${receipt.id}`).set('Authorization', token)).body.transactionId).toBeNull();
    expect(await db.select().from(transactions).where(eq(transactions.id, b.id))).toHaveLength(1);
  });

  it('409 si el movimiento ya tiene otro ticket; 400 si es un ingreso', async () => {
    const { token, receipt, movement, user, category } = await setup();
    const m = await movement('2026-10-15', '39.27');
    const [otro] = await db.insert(receipts).values({ userId: user.id, supermarketId: receipt.supermarketId, date: '2026-10-15', printedTotal: '1.00' }).returning();
    await link(token, otro.id, m.id).expect(200);
    await link(token, receipt.id, m.id).expect(409);

    const [ingreso] = await db.insert(transactions).values({ userId: user.id, type: 'INCOME', date: '2026-10-15', categoryId: category.id, concept: 'X', amount: '39.27' }).returning();
    await link(token, receipt.id, ingreso.id).expect(400);
  });

  it('borrar el movimiento deja el ticket sin enlace; borrar el ticket deja el movimiento sin ticket', async () => {
    const { token, receipt, movement, user } = await setup();
    const a = await movement('2026-10-15', '39.27');
    await link(token, receipt.id, a.id).expect(200);
    await request(server()).delete(`/transactions/${a.id}`).set('Authorization', token).expect(204);
    expect((await request(server()).get(`/receipts/${receipt.id}`).set('Authorization', token)).body.transactionId).toBeNull();

    const b = await movement('2026-10-15', '39.27');
    await link(token, receipt.id, b.id).expect(200);
    await request(server()).delete(`/receipts/${receipt.id}`).set('Authorization', token).expect(204);
    const after = await request(server()).get(`/transactions/${b.id}`).set('Authorization', token).expect(200);
    expect(after.body).toMatchObject({ id: b.id, amount: '39.27', receiptId: null });
    expect(await db.select().from(transactions).where(eq(transactions.userId, user.id))).toHaveLength(1);
  });

  it('enlazar no crea ni modifica movimientos (H3 criterio 6)', async () => {
    const { token, receipt, movement, user } = await setup();
    const a = await movement('2026-10-15', '39.27');
    const before = await db.select().from(transactions).where(eq(transactions.userId, user.id));
    await link(token, receipt.id, a.id).expect(200);
    await candidates(token, receipt.id);
    await request(server()).delete(`/receipts/${receipt.id}/transaction`).set('Authorization', token).expect(204);
    expect(await db.select().from(transactions).where(eq(transactions.userId, user.id))).toEqual(before);
  });

  it('aislamiento: 404 con el ticket o el movimiento de otro usuario, y sus candidatos no se mezclan', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    const deAna = await ana.movement('2026-10-15', '39.27');
    const deBea = await bea.movement('2026-10-15', '39.27');

    await link(bea.token, ana.receipt.id, deBea.id).expect(404);
    await link(bea.token, bea.receipt.id, deAna.id).expect(404);
    await request(server()).delete(`/receipts/${ana.receipt.id}/transaction`).set('Authorization', bea.token).expect(404);
    await request(server()).get(`/receipts/${ana.receipt.id}/transaction-candidates`).set('Authorization', bea.token).expect(404);
    expect((await candidates(bea.token, bea.receipt.id)).body.map((m: { id: string }) => m.id)).toEqual([deBea.id]);
  });
});
