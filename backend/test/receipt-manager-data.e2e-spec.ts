import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { receiptDocuments, receiptTagLinks, receiptTags, receipts, supermarkets, users } from '../src/db/schema/index.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';
import { ReceiptOcrService } from '../src/receipt-import/receipt-ocr.service.js';
import { JPEG } from './support/documents.js';
import { binaryParser, buildZip, readZip } from './support/zip.js';

/** Spec 051 H7: etiquetas, notas, garantías y textos en la copia de seguridad. */
describe('Datos del gestor de tickets en la copia (e2e) — spec 051 H7', () => {
  let app: INestApplication<App>;
  let db: Database;
  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReceiptOcrService)
      .useValue({ extractText: vi.fn().mockResolvedValue('LAVADORA BOSCH SERIE 6') })
      .compile();
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
    app.get(RateLimitGuard).resetForTests();
  });

  const server = () => app.getHttpServer();

  async function setup(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    const res = await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return { user, token: `Bearer ${res.body.accessToken as string}` };
  }

  /** Ana: un ticket con nota, garantía, documento con texto y dos etiquetas, y otro sin nada. */
  async function anaWithData() {
    const ana = await setup('ana@example.com');
    const [shop] = await db.insert(supermarkets).values({ userId: ana.user.id, name: 'Media Markt' }).returning();
    const [lavadora] = await db
      .insert(receipts)
      .values({ userId: ana.user.id, supermarketId: shop.id, date: '2026-10-15', printedTotal: '549.00', note: 'Serie WAU28', warrantyUntil: '2029-10-15' })
      .returning();
    await db.insert(receipts).values({ userId: ana.user.id, supermarketId: shop.id, date: '2026-10-16', printedTotal: '9.99' });
    await request(server()).put(`/receipts/${lavadora.id}/document`).set('Authorization', ana.token).attach('file', JPEG, 'ticket.jpg').expect(200);
    await request(server()).put(`/receipts/${lavadora.id}/tags`).set('Authorization', ana.token).send({ newTags: ['Garantía', 'Hogar'] }).expect(200);
    return { ...ana, lavadora };
  }

  const exportJson = async (token: string) => (await request(server()).get('/users/me/export').set('Authorization', token).expect(200)).body;
  const exportZip = async (token: string) =>
    (await request(server()).get('/users/me/export/archive').set('Authorization', token).buffer(true).parse(binaryParser).expect(200)).body as Buffer;
  const importFile = (token: string, content: Buffer, name: string, step: 'preview' | 'confirm' = 'confirm') =>
    request(server()).post(`/data-import/${step}`).set('Authorization', token).attach('file', content, name);

  it('la exportación trae etiquetas, enlaces, nota, garantía y texto del documento, sin la miniatura', async () => {
    const ana = await anaWithData();
    const data = await exportJson(ana.token);
    expect(data.economicData.receiptTags.map((t: { name: string }) => t.name).sort()).toEqual(['Garantía', 'Hogar']);
    expect(data.economicData.receiptTagLinks).toHaveLength(2);
    expect(data.economicData.receipts.find((r: { id: string }) => r.id === ana.lavadora.id)).toMatchObject({ note: 'Serie WAU28', warrantyUntil: '2029-10-15' });
    expect(data.economicData.receiptDocuments[0]).toMatchObject({ ocrText: 'LAVADORA BOSCH SERIE 6', ocrReadAt: expect.any(String) });
    expect(data.economicData.receiptDocuments[0]).not.toHaveProperty('thumbnail');
  });

  it('ida y vuelta completa en otra cuenta: todo se restaura y la miniatura se regenera al pedirla', async () => {
    const ana = await anaWithData();
    const archive = await exportZip(ana.token);
    await db.delete(users).where(eq(users.id, ana.user.id));

    const bea = await setup('bea@example.com');
    const preview = await importFile(bea.token, archive, 'copia.zip', 'preview').expect(201);
    const res = await importFile(bea.token, archive, 'copia.zip').expect(201);
    expect(preview.body).toEqual(res.body);
    expect(res.body.receiptTags).toEqual({ total: 2, toImport: 2, alreadyExisting: 0 });
    expect(res.body.receiptTagLinks).toEqual({ total: 2, toImport: 2, alreadyExisting: 0, omitted: 0 });

    const detail = await request(server()).get(`/receipts/${ana.lavadora.id}`).set('Authorization', bea.token).expect(200);
    expect(detail.body).toMatchObject({ note: 'Serie WAU28', warrantyUntil: '2029-10-15', document: { hasText: true } });
    expect(detail.body.tags.map((t: { name: string }) => t.name)).toEqual(['Garantía', 'Hogar']);
    const found = await request(server()).get('/receipts?q=bosch').set('Authorization', bea.token).expect(200);
    expect(found.body.map((r: { id: string }) => r.id)).toEqual([ana.lavadora.id]);
    const [doc] = await db.select({ thumbnail: receiptDocuments.thumbnail }).from(receiptDocuments).where(eq(receiptDocuments.receiptId, ana.lavadora.id));
    expect(doc.thumbnail).toBeNull();
  });

  it('una etiqueta con el mismo nombre que una existente se reutiliza, y sus enlaces apuntan a la existente', async () => {
    const ana = await anaWithData();
    const data = await exportJson(ana.token);
    await db.delete(users).where(eq(users.id, ana.user.id));

    const bea = await setup('bea@example.com');
    const [own] = await db.insert(receiptTags).values({ userId: bea.user.id, name: 'GARANTIA', color: 'red' }).returning();
    const res = await importFile(bea.token, Buffer.from(JSON.stringify(data)), 'copia.json').expect(201);
    expect(res.body.receiptTags).toEqual({ total: 2, toImport: 1, alreadyExisting: 1 });
    expect(res.body.receiptTagLinks).toMatchObject({ toImport: 2, omitted: 0 });

    const tags = await db.select().from(receiptTags).where(eq(receiptTags.userId, bea.user.id));
    expect(tags.map((t) => t.name).sort()).toEqual(['GARANTIA', 'Hogar']);
    const links = await db.select().from(receiptTagLinks).where(eq(receiptTagLinks.receiptId, ana.lavadora.id));
    expect(links.map((l) => l.tagId)).toContain(own.id);
  });

  it('enlaces a un ticket o una etiqueta de otra cuenta, o desconocidos, se omiten', async () => {
    const ana = await anaWithData();
    const data = await exportJson(ana.token);
    const bea = await setup('bea@example.com');
    const [beaShop] = await db.insert(supermarkets).values({ userId: bea.user.id, name: 'Propio' }).returning();
    const [beaReceipt] = await db.insert(receipts).values({ userId: bea.user.id, supermarketId: beaShop.id, date: '2026-10-01', printedTotal: '1.00' }).returning();
    const anaTagId = data.economicData.receiptTags[0].id;

    // Bea importa solo enlaces: a una etiqueta de Ana (ajena) y a un ticket de Ana (ajeno).
    const file = {
      ...data,
      economicData: Object.fromEntries(Object.keys(data.economicData).map((k) => [k, []])),
    };
    file.economicData.receiptTagLinks = [
      { receiptId: beaReceipt.id, tagId: anaTagId },
      { receiptId: ana.lavadora.id, tagId: anaTagId },
      { receiptId: beaReceipt.id, tagId: '00000000-0000-4000-8000-000000000000' },
    ];
    const res = await importFile(bea.token, Buffer.from(JSON.stringify(file)), 'copia.json').expect(201);
    expect(res.body.receiptTagLinks).toEqual({ total: 3, toImport: 0, alreadyExisting: 0, omitted: 3 });
    expect(await db.select().from(receiptTagLinks).where(eq(receiptTagLinks.receiptId, beaReceipt.id))).toEqual([]);
  });

  it('una copia anterior sin etiquetas se importa; una etiqueta con color fuera de la paleta invalida el fichero (400)', async () => {
    const ana = await anaWithData();
    const entries = await readZip(await exportZip(ana.token));
    const data = JSON.parse(entries.get('datos.json')!.toString());
    await db.delete(users).where(eq(users.id, ana.user.id));
    const bea = await setup('bea@example.com');

    const old = structuredClone(data);
    delete old.economicData.receiptTags;
    delete old.economicData.receiptTagLinks;
    const res = await importFile(bea.token, await buildZip({ ...Object.fromEntries(entries), 'datos.json': JSON.stringify(old) }), 'copia.zip').expect(201);
    expect(res.body.receipts.toImport).toBe(2);
    expect(res.body.receiptTags).toEqual({ total: 0, toImport: 0, alreadyExisting: 0 });

    data.economicData.receiptTags[0].color = 'pink';
    await importFile(bea.token, Buffer.from(JSON.stringify(data)), 'copia.json').expect(400);
  });
});
