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
import { receipts, supermarkets, users } from '../src/db/schema/index.js';

/** Spec 051 H4 y H5: nota y garantía de un ticket. */
describe('Nota y garantía de tickets (e2e) — spec 051 H4 y H5', () => {
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
    const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: shop.id, date: '2026-10-15', printedTotal: '549.00' }).returning();
    return { user, token: `Bearer ${res.body.accessToken as string}`, receipt, shop };
  }

  const patch = (token: string, id: string, body: object) => request(server()).patch(`/receipts/${id}/details`).set('Authorization', token).send(body);

  it('guarda nota y garantía, cambia solo lo que viene y quita con null', async () => {
    const { token, receipt } = await setup();
    const saved = await patch(token, receipt.id, { note: '  Lavadora Bosch, n.º de serie 1234  ', warrantyUntil: '2029-10-15' }).expect(200);
    expect(saved.body).toMatchObject({ note: 'Lavadora Bosch, n.º de serie 1234', hasNote: true, warrantyUntil: '2029-10-15' });

    const onlyNote = await patch(token, receipt.id, { note: 'Otra nota' }).expect(200);
    expect(onlyNote.body).toMatchObject({ note: 'Otra nota', warrantyUntil: '2029-10-15' });

    const cleared = await patch(token, receipt.id, { note: '   ', warrantyUntil: null }).expect(200);
    expect(cleared.body).toMatchObject({ note: null, hasNote: false, warrantyUntil: null });
  });

  it('el listado indica si hay nota (sin traerla) y la garantía', async () => {
    const { token, receipt } = await setup();
    await patch(token, receipt.id, { note: 'Nota', warrantyUntil: '2028-10-15' }).expect(200);
    const res = await request(server()).get('/receipts').set('Authorization', token).expect(200);
    expect(res.body[0]).toMatchObject({ hasNote: true, warrantyUntil: '2028-10-15' });
    expect(res.body[0]).not.toHaveProperty('note');
  });

  it('valida la longitud de la nota y la fecha (400)', async () => {
    const { token, receipt } = await setup();
    expect((await patch(token, receipt.id, { note: 'x'.repeat(2001) }).expect(400)).body.message).toEqual(['La nota no puede tener más de 2000 caracteres.']);
    await patch(token, receipt.id, { note: 'x'.repeat(2000) }).expect(200);
    for (const warrantyUntil of ['2026-02-30', '15/10/2029', 'mañana']) {
      await patch(token, receipt.id, { warrantyUntil }).expect(400);
    }
  });

  it('editar el ticket (spec 035) no toca la nota ni la garantía', async () => {
    const { token, receipt, shop } = await setup();
    await patch(token, receipt.id, { note: 'Nota', warrantyUntil: '2028-10-15' }).expect(200);
    await request(server())
      .put(`/receipts/${receipt.id}`)
      .set('Authorization', token)
      .send({ supermarket: { id: shop.id }, date: '2026-10-16', printedTotal: '550.00', lines: [] })
      .expect(200);
    const detail = await request(server()).get(`/receipts/${receipt.id}`).set('Authorization', token).expect(200);
    expect(detail.body).toMatchObject({ date: '2026-10-16', note: 'Nota', warrantyUntil: '2028-10-15' });
  });

  it('la nota se puede escribir al confirmar una importación', async () => {
    const { token } = await setup();
    const res = await request(server())
      .post('/receipt-import/confirm')
      .set('Authorization', token)
      .send({ supermarket: { name: 'Leroy Merlin' }, date: '2026-10-20', printedTotal: '89.90', lines: [], note: 'Taladro' })
      .expect(201);
    const detail = await request(server()).get(`/receipts/${res.body.receiptId}`).set('Authorization', token).expect(200);
    expect(detail.body.note).toBe('Taladro');
  });

  it('aislamiento: el ticket de otro usuario da 404 y no cambia', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    await patch(ana.token, bea.receipt.id, { note: 'Mía' }).expect(404);
    const [row] = await db.select().from(receipts).where(eq(receipts.id, bea.receipt.id));
    expect(row.note).toBeNull();
  });
});
