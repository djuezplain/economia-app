import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { products, receiptDocuments, receiptLines, receiptTagLinks, receiptTags, receipts, supermarkets, users } from '../src/db/schema/index.js';
import { todayInRemindersTimeZone } from '../src/recurring-transactions/recurring-reminders.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.parse(`${todayInRemindersTimeZone()}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Spec 051 H2, H1 criterio 4 y H5 criterio 2: buscador y filtros del historial. */
describe('Buscador de tickets (e2e) — spec 051 H2', () => {
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

  /**
   * Ana: lavadora en Media Markt (nota, documento, etiquetas Garantía y Hogar,
   * garantía en 20 días), compra en Mercadona (líneas y producto), taladro en
   * Leroy Merlin (solo en el documento) y farmacia (etiquetas Salud y
   * Garantía, nota con "5x0", garantía caducada).
   */
  async function setup(email = 'ana@example.com') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    const shop = async (name: string) => (await db.insert(supermarkets).values({ userId: user.id, name }).returning())[0];
    const tag = async (name: string) => (await db.insert(receiptTags).values({ userId: user.id, name }).returning())[0];
    const receipt = async (supermarketId: string, date: string, extra: Partial<typeof receipts.$inferInsert> = {}) =>
      (await db.insert(receipts).values({ userId: user.id, supermarketId, date, printedTotal: '10.00', ...extra }).returning())[0];
    const doc = (receiptId: string, ocrText: string) =>
      db.insert(receiptDocuments).values({ userId: user.id, receiptId, mimeType: 'application/pdf', sizeBytes: 1, sha256: 'a'.repeat(64), originalFilename: 'd.pdf', content: Buffer.from('x'), ocrText });

    const mediaMarkt = await shop('Media Markt');
    const mercadona = await shop('Mercadona');
    const leroy = await shop('Leroy Merlin');
    const farmacia = await shop('Farmacia López');
    const [garantia, hogar, salud] = [await tag('Garantía'), await tag('Hogar'), await tag('Salud')];

    const lavadora = await receipt(mediaMarkt.id, '2026-10-04', { note: 'Lavadora Bosch, número de serie WAU28', warrantyUntil: inDays(20) });
    await doc(lavadora.id, 'MEDIA MARKT\nLAVADORA BOSCH SERIE 6\nTOTAL 549,00');
    const compra = await receipt(mercadona.id, '2026-10-03');
    const [leche] = await db.insert(products).values({ userId: user.id, name: 'Leche entera' }).returning();
    await db.insert(receiptLines).values([
      { receiptId: compra.id, productId: leche.id, description: 'LCH ENT 1L', quantity: '1', unit: 'unidad', pricePerUnit: '1.050', amount: '1.05' },
      { receiptId: compra.id, productId: null, description: 'PAN DE PUEBLO', quantity: '1', unit: 'unidad', pricePerUnit: '0.900', amount: '0.90' },
    ]);
    const taladro = await receipt(leroy.id, '2026-10-02', { warrantyUntil: inDays(400) });
    await doc(taladro.id, 'LEROY MERLIN\nTALADRO PERCUTOR 18V\n50% DTO SEGUNDA UNIDAD');
    const pastillas = await receipt(farmacia.id, '2026-10-01', { note: '5x0 pastillas', warrantyUntil: inDays(-1) });
    await db.insert(receiptTagLinks).values([
      { receiptId: lavadora.id, tagId: garantia.id },
      { receiptId: lavadora.id, tagId: hogar.id },
      { receiptId: pastillas.id, tagId: salud.id },
      { receiptId: pastillas.id, tagId: garantia.id },
    ]);
    return { user, token: `Bearer ${res.body.accessToken as string}`, ids: { lavadora: lavadora.id, compra: compra.id, taladro: taladro.id, pastillas: pastillas.id }, tags: { garantia, hogar, salud }, mercadona };
  }

  type Result = { id: string; match?: { field: string; snippet: string | null } };
  const search = async (token: string, query: string) =>
    (await request(app.getHttpServer()).get(`/receipts?${query}`).set('Authorization', token).expect(200)).body as Result[];
  const q = (text: string) => `q=${encodeURIComponent(text)}`;

  it('busca en el comercio, las etiquetas, la nota, las líneas, los productos y el documento, e indica dónde', async () => {
    const { token, ids } = await setup();
    expect(await search(token, q('media'))).toEqual([expect.objectContaining({ id: ids.lavadora, match: { field: 'merchant', snippet: null } })]);
    expect(await search(token, q('salud'))).toEqual([expect.objectContaining({ id: ids.pastillas, match: { field: 'tag', snippet: null } })]);
    expect(await search(token, q('serie'))).toEqual([
      expect.objectContaining({ id: ids.lavadora, match: { field: 'note', snippet: 'Lavadora Bosch, número de serie WAU28' } }),
    ]);
    expect(await search(token, q('pueblo'))).toEqual([expect.objectContaining({ id: ids.compra, match: { field: 'line', snippet: 'PAN DE PUEBLO' } })]);
    expect(await search(token, q('leche'))).toEqual([expect.objectContaining({ id: ids.compra, match: { field: 'product', snippet: 'Leche entera' } })]);
    expect(await search(token, q('percutor'))).toEqual([
      expect.objectContaining({ id: ids.taladro, match: { field: 'document', snippet: 'LEROY MERLIN TALADRO PERCUTOR 18V 50% DTO SEGUNDA UNIDAD' } }),
    ]);
  });

  it('sin distinguir tildes ni mayúsculas, con palabras a medias', async () => {
    const { token, ids } = await setup();
    expect((await search(token, q('LAVÁD'))).map((r) => r.id)).toEqual([ids.lavadora]);
    expect((await search(token, q('NUMERO'))).map((r) => r.id)).toEqual([ids.lavadora]);
    expect((await search(token, q('garantia'))).map((r) => r.id)).toEqual([ids.lavadora, ids.pastillas]);
    expect((await search(token, q('lopez'))).map((r) => r.id)).toEqual([ids.pastillas]);
  });

  it('varias palabras: todas tienen que aparecer, cada una en cualquier campo', async () => {
    const { token, ids } = await setup();
    expect((await search(token, q('media hogar bosch'))).map((r) => r.id)).toEqual([ids.lavadora]);
    expect(await search(token, q('media taladro'))).toEqual([]);
  });

  it('los comodines se buscan como texto; una búsqueda vacía o de un carácter no filtra', async () => {
    const { token, ids } = await setup();
    expect((await search(token, q('50%'))).map((r) => r.id)).toEqual([ids.taladro]);
    expect(await search(token, q('5_0'))).toEqual([]);
    expect(await search(token, q('%%'))).toEqual([]);
    expect(await search(token, q('x'))).toHaveLength(4);
    expect(await search(token, q('   '))).toHaveLength(4);
    expect((await search(token, ''))[0]).not.toHaveProperty('match');
  });

  it('se combina con los filtros que ya existían', async () => {
    const { token, ids, mercadona } = await setup();
    expect(await search(token, `${q('lavadora')}&supermarketId=${mercadona.id}`)).toEqual([]);
    expect((await search(token, `${q('garantia')}&dateTo=2026-10-02`)).map((r) => r.id)).toEqual([ids.pastillas]);
  });

  it('filtro por etiquetas: tickets con todas las elegidas', async () => {
    const { token, ids, tags } = await setup();
    expect((await search(token, `tagIds=${tags.garantia.id}`)).map((r) => r.id)).toEqual([ids.lavadora, ids.pastillas]);
    expect((await search(token, `tagIds=${tags.garantia.id}&tagIds=${tags.hogar.id}`)).map((r) => r.id)).toEqual([ids.lavadora]);
    expect((await search(token, `tagIds=${tags.garantia.id}&${q('farmacia')}`)).map((r) => r.id)).toEqual([ids.pastillas]);
  });

  it('filtro de garantía: vigente (también la que caduca pronto) y que caduca en 30 días', async () => {
    const { token, ids } = await setup();
    expect((await search(token, 'warranty=active')).map((r) => r.id)).toEqual([ids.lavadora, ids.taladro]);
    expect((await search(token, 'warranty=expiring')).map((r) => r.id)).toEqual([ids.lavadora]);
  });

  it('valida los parámetros (400)', async () => {
    const { token } = await setup();
    for (const query of [q('x'.repeat(201)), 'tagIds=no-es-uuid', 'warranty=caducada']) {
      await request(app.getHttpServer()).get(`/receipts?${query}`).set('Authorization', token).expect(400);
    }
  });

  it('aislamiento: nunca encuentra tickets, etiquetas ni textos de otro usuario', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    const anaIds = Object.values(ana.ids);
    for (const text of ['lavadora', 'garantia', 'percutor', 'leche', 'media']) {
      expect((await search(ana.token, q(text))).every((r) => anaIds.includes(r.id))).toBe(true);
    }
    // Una etiqueta de Bea no filtra los tickets de Ana.
    expect(await search(ana.token, `tagIds=${bea.tags.garantia.id}`)).toEqual([]);
  });
});
