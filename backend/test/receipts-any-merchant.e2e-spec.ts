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
import { receiptLines, receipts, users } from '../src/db/schema/index.js';

/** Spec 048 H2: tickets y facturas de cualquier comercio, con o sin desglose. */
describe('Tickets sin desglose y líneas sin producto (e2e) — spec 048 H2', () => {
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

  async function setup(email = 'ana@example.com') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return { user, token: `Bearer ${res.body.accessToken as string}` };
  }

  const server = () => app.getHttpServer();
  const confirm = (token: string, body: object) => request(server()).post('/receipt-import/confirm').set('Authorization', token).send(body);
  const line = (description: string, amount: string, product: object | null) => ({
    description,
    quantity: '1',
    unit: 'unidad',
    pricePerUnit: `${amount}0`,
    amount,
    product,
  });

  it('una factura sin líneas se guarda con su total, que es su importe', async () => {
    const { token } = await setup();
    const saved = await confirm(token, { supermarket: { name: 'Iberdrola' }, date: '2026-10-14', printedTotal: '64.20', lines: [] }).expect(201);
    const detail = await request(server()).get(`/receipts/${saved.body.receiptId as string}`).set('Authorization', token).expect(200);
    expect(detail.body).toMatchObject({ supermarketName: 'Iberdrola', lines: [], linesTotal: '0.00', total: '64.20' });
  });

  it('sin líneas y sin total → 400 y no se guarda nada', async () => {
    const { token } = await setup();
    const res = await confirm(token, { supermarket: { name: 'Iberdrola' }, date: '2026-10-14', lines: [] }).expect(400);
    expect(res.body.message).toBe('Un ticket sin líneas necesita el total.');
    expect(await db.select().from(receipts)).toEqual([]);
  });

  it('con líneas, el total es su suma aunque el total impreso diga otra cosa (como en la spec 040)', async () => {
    const { token } = await setup();
    const saved = await confirm(token, { supermarket: { name: 'Mercadona' }, date: '2026-10-14', printedTotal: '99.99', lines: [line('LECHE', '0.95', { name: 'Leche' })] }).expect(201);
    const detail = await request(server()).get(`/receipts/${saved.body.receiptId as string}`).set('Authorization', token).expect(200);
    expect(detail.body.total).toBe('0.95');
  });

  it('una línea sin producto se guarda, no crea producto y no aparece en la comparativa ni rompe el listado de productos', async () => {
    const { token } = await setup();
    const saved = await confirm(token, {
      supermarket: { name: 'Farmacia Pérez' },
      date: '2026-10-14',
      lines: [line('IBUPROFENO 600', '3.45', null), line('PASTA DIENTES', '2.10', { name: 'Pasta de dientes' })],
    }).expect(201);
    const receiptId = saved.body.receiptId as string;

    const rows = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
    expect(rows.map((r) => [r.description, r.productId === null])).toEqual(
      expect.arrayContaining([
        ['IBUPROFENO 600', true],
        ['PASTA DIENTES', false],
      ]),
    );

    const detail = await request(server()).get(`/receipts/${receiptId}`).set('Authorization', token).expect(200);
    expect(detail.body.lines.find((l: { description: string }) => l.description === 'IBUPROFENO 600')).toMatchObject({ productId: null, productName: null });

    const productList = await request(server()).get('/products').set('Authorization', token).expect(200);
    expect(productList.body.map((p: { name: string }) => p.name)).toEqual(['Pasta de dientes']);
    const pasta = productList.body[0] as { id: string };
    const prices = await request(server()).get(`/products/${pasta.id}/prices`).set('Authorization', token).expect(200);
    expect(prices.body).toHaveLength(1);
  });

  it('el filtro por importe (spec 040) usa el total: también encuentra una factura sin líneas', async () => {
    const { token } = await setup();
    await confirm(token, { supermarket: { name: 'Iberdrola' }, date: '2026-10-14', printedTotal: '64.20', lines: [] }).expect(201);
    await confirm(token, { supermarket: { name: 'Mercadona' }, date: '2026-10-15', lines: [line('LECHE', '0.95', { name: 'Leche' })] }).expect(201);

    const between = await request(server()).get('/receipts?amountMin=60&amountMax=70').set('Authorization', token).expect(200);
    expect(between.body.map((r: { supermarketName: string }) => r.supermarketName)).toEqual(['Iberdrola']);
    const low = await request(server()).get('/receipts?amountMax=1').set('Authorization', token).expect(200);
    expect(low.body.map((r: { supermarketName: string }) => r.supermarketName)).toEqual(['Mercadona']);
  });

  it('editar (spec 035) sigue las mismas reglas: puede quitar todas las líneas si deja el total, y no sin él', async () => {
    const { token } = await setup();
    const saved = await confirm(token, { supermarket: { name: 'Mercadona' }, date: '2026-10-15', lines: [line('LECHE', '0.95', { name: 'Leche' })] }).expect(201);
    const id = saved.body.receiptId as string;

    await request(server()).put(`/receipts/${id}`).set('Authorization', token).send({ supermarket: { name: 'Mercadona' }, date: '2026-10-15', lines: [] }).expect(400);
    const updated = await request(server())
      .put(`/receipts/${id}`)
      .set('Authorization', token)
      .send({ supermarket: { name: 'Mercadona' }, date: '2026-10-15', printedTotal: '0.95', lines: [line('LECHE', '0.95', null)] })
      .expect(200);
    expect(updated.body.lines[0]).toMatchObject({ productId: null });
  });
});
