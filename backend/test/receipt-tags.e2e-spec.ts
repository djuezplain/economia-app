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
import { receiptTagLinks, receiptTags, receipts, supermarkets, users } from '../src/db/schema/index.js';

/** Spec 051 H1: etiquetas de los tickets. */
describe('Etiquetas de tickets (e2e) — spec 051 H1', () => {
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

  async function setup(email = 'ana@example.com') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    const res = await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    const [shop] = await db.insert(supermarkets).values({ userId: user.id, name: 'Media Markt' }).returning();
    const addReceipt = async (date = '2026-10-15') =>
      (await db.insert(receipts).values({ userId: user.id, supermarketId: shop.id, date, printedTotal: '549.00' }).returning())[0];
    return { user, token: `Bearer ${res.body.accessToken as string}`, addReceipt };
  }

  const create = (token: string, body: object) => request(server()).post('/receipt-tags').set('Authorization', token).send(body);
  const setTags = (token: string, receiptId: string, body: object) => request(server()).put(`/receipts/${receiptId}/tags`).set('Authorization', token).send(body);
  const list = (token: string) => request(server()).get('/receipt-tags').set('Authorization', token).expect(200);

  it('crear, listar con el número de tickets, renombrar, cambiar el color y borrar', async () => {
    const { token, addReceipt } = await setup();
    const garantia = (await create(token, { name: '  Garantía  ', color: 'blue' }).expect(201)).body;
    expect(garantia).toEqual({ id: expect.any(String), name: 'Garantía', color: 'blue' });
    const trabajo = (await create(token, { name: 'Trabajo' }).expect(201)).body;
    expect(trabajo.color).toBeNull();
    const receipt = await addReceipt();
    await setTags(token, receipt.id, { tagIds: [garantia.id] }).expect(200);

    expect((await list(token)).body).toEqual([
      { ...garantia, receiptCount: 1 },
      { ...trabajo, receiptCount: 0 },
    ]);

    const renamed = await request(server()).patch(`/receipt-tags/${trabajo.id}`).set('Authorization', token).send({ name: 'Oficina', color: 'green' }).expect(200);
    expect(renamed.body).toEqual({ id: trabajo.id, name: 'Oficina', color: 'green' });
    const noColor = await request(server()).patch(`/receipt-tags/${trabajo.id}`).set('Authorization', token).send({ color: null }).expect(200);
    expect(noColor.body.color).toBeNull();

    await request(server()).delete(`/receipt-tags/${garantia.id}`).set('Authorization', token).expect(204);
    // Se quita del ticket sin borrarlo.
    expect(await db.select().from(receiptTagLinks)).toEqual([]);
    expect(await db.select().from(receipts).where(eq(receipts.id, receipt.id))).toHaveLength(1);
  });

  it('el nombre es único sin distinguir mayúsculas ni tildes, también al renombrar (409)', async () => {
    const { token } = await setup();
    await create(token, { name: 'Garantía' }).expect(201);
    expect((await create(token, { name: 'GARANTIA' }).expect(409)).body.message).toBe('Ya tienes una etiqueta con ese nombre.');
    const other = (await create(token, { name: 'Regalo' }).expect(201)).body;
    await request(server()).patch(`/receipt-tags/${other.id}`).set('Authorization', token).send({ name: 'garantía' }).expect(409);
  });

  it('valida nombre y color (400)', async () => {
    const { token } = await setup();
    await create(token, { name: '   ' }).expect(400);
    await create(token, { name: 'x'.repeat(41) }).expect(400);
    await create(token, { name: 'Rosa', color: 'pink' }).expect(400);
  });

  it('al ticket: sustituye las que tuviera, crea al vuelo y reutiliza la que ya tenga ese nombre', async () => {
    const { token, addReceipt } = await setup();
    const garantia = (await create(token, { name: 'Garantía', color: 'blue' }).expect(201)).body;
    const receipt = await addReceipt();

    const res = await setTags(token, receipt.id, { tagIds: [garantia.id], newTags: ['Hogar', 'garantia'] }).expect(200);
    expect(res.body.map((t: { name: string }) => t.name)).toEqual(['Garantía', 'Hogar']);
    expect(await db.select().from(receiptTags)).toHaveLength(2);

    const replaced = await setTags(token, receipt.id, { newTags: ['Regalo'] }).expect(200);
    expect(replaced.body.map((t: { name: string }) => t.name)).toEqual(['Regalo']);
    expect((await setTags(token, receipt.id, {}).expect(200)).body).toEqual([]);
  });

  it('el listado y el detalle de tickets traen sus etiquetas', async () => {
    const { token, addReceipt } = await setup();
    const receipt = await addReceipt();
    await addReceipt('2026-10-01');
    await setTags(token, receipt.id, { newTags: ['Trabajo', 'Garantía'] }).expect(200);

    const listRes = await request(server()).get('/receipts').set('Authorization', token).expect(200);
    expect(listRes.body.map((r: { tags: { name: string }[] }) => r.tags.map((t) => t.name))).toEqual([['Garantía', 'Trabajo'], []]);
    const detail = await request(server()).get(`/receipts/${receipt.id}`).set('Authorization', token).expect(200);
    expect(detail.body.tags).toEqual([
      { id: expect.any(String), name: 'Garantía', color: null },
      { id: expect.any(String), name: 'Trabajo', color: null },
    ]);
  });

  it('como mucho 20 etiquetas por ticket (400)', async () => {
    const { token, addReceipt } = await setup();
    const receipt = await addReceipt();
    await setTags(token, receipt.id, { newTags: Array.from({ length: 21 }, (_, i) => `E${i}`) }).expect(400);
  });

  it('aislamiento: las etiquetas y los tickets de otro usuario dan 404', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    const beaTag = (await create(bea.token, { name: 'De Bea' }).expect(201)).body;
    const beaReceipt = await bea.addReceipt();
    const anaReceipt = await ana.addReceipt();

    expect((await list(ana.token)).body).toEqual([]);
    await request(server()).patch(`/receipt-tags/${beaTag.id}`).set('Authorization', ana.token).send({ name: 'Mía' }).expect(404);
    await request(server()).delete(`/receipt-tags/${beaTag.id}`).set('Authorization', ana.token).expect(404);
    await setTags(ana.token, anaReceipt.id, { tagIds: [beaTag.id] }).expect(404);
    await setTags(ana.token, beaReceipt.id, { newTags: ['Mía'] }).expect(404);
    // Ana puede tener una etiqueta con el mismo nombre que una de Bea.
    await create(ana.token, { name: 'de bea' }).expect(201);
    expect(await db.select().from(receiptTagLinks)).toEqual([]);
  });

  it('al confirmar una importación, con etiquetas existentes y nuevas en la misma transacción', async () => {
    const { token, user } = await setup();
    const garantia = (await create(token, { name: 'Garantía' }).expect(201)).body;
    const res = await request(server())
      .post('/receipt-import/confirm')
      .set('Authorization', token)
      .send({ supermarket: { name: 'Leroy Merlin' }, date: '2026-10-20', printedTotal: '89.90', lines: [], tags: { tagIds: [garantia.id], newTags: ['Hogar'] } })
      .expect(201);
    const detail = await request(server()).get(`/receipts/${res.body.receiptId}`).set('Authorization', token).expect(200);
    expect(detail.body.tags.map((t: { name: string }) => t.name)).toEqual(['Garantía', 'Hogar']);

    // Una etiqueta ajena hace fallar la confirmación entera: no se guarda el ticket.
    const bea = await setup('bea@example.com');
    const beaTag = (await create(bea.token, { name: 'Ajena' }).expect(201)).body;
    await request(server())
      .post('/receipt-import/confirm')
      .set('Authorization', token)
      .send({ supermarket: { name: 'Leroy Merlin' }, date: '2026-10-21', printedTotal: '10.00', lines: [], tags: { tagIds: [beaTag.id] } })
      .expect(404);
    expect(await db.select().from(receipts).where(eq(receipts.userId, user.id))).toHaveLength(1);
  });
});
