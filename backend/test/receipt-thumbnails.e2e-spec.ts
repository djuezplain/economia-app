import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { receiptDocuments, receipts, supermarkets, users } from '../src/db/schema/index.js';
import { ReceiptOcrService } from '../src/receipt-import/receipt-ocr.service.js';
import { JPEG as BROKEN_JPEG, PDF } from './support/documents.js';
import { binaryParser } from './support/zip.js';

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 245, g: 240, b: 230 } } }).jpeg({ quality: 90 }).toBuffer();

/** Spec 051 H6: miniaturas de los documentos para la galería. */
describe('Miniaturas de documentos (e2e) — spec 051 H6', () => {
  let app: INestApplication<App>;
  let db: Database;
  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReceiptOcrService)
      .useValue({ extractText: vi.fn().mockResolvedValue('TEXTO') })
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
  });

  const server = () => app.getHttpServer();

  async function setup(email = 'ana@example.com') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    const res = await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    const [shop] = await db.insert(supermarkets).values({ userId: user.id, name: 'Media Markt' }).returning();
    const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: shop.id, date: '2026-10-15', printedTotal: '549.00' }).returning();
    return { user, token: `Bearer ${res.body.accessToken as string}`, receipt };
  }

  const upload = (token: string, receiptId: string, content: Buffer, name = 'ticket.jpg') =>
    request(server()).put(`/receipts/${receiptId}/document`).set('Authorization', token).attach('file', content, name).expect(200);
  const thumbnail = (token: string, receiptId: string) =>
    request(server()).get(`/receipts/${receiptId}/document/thumbnail`).set('Authorization', token).buffer(true).parse(binaryParser);

  it('al subir una foto se guarda su miniatura, que se sirve en JPEG con caché privada', async () => {
    const { token, receipt } = await setup();
    await upload(token, receipt.id, await photo(3000, 4000));
    const [row] = await db.select({ thumbnail: receiptDocuments.thumbnail }).from(receiptDocuments).where(eq(receiptDocuments.receiptId, receipt.id));
    expect(row.thumbnail!.length).toBeGreaterThan(0);

    const res = await thumbnail(token, receipt.id).expect(200);
    expect(res.headers).toMatchObject({ 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' });
    const meta = await sharp(res.body as Buffer).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 360, height: 480 });
  });

  it('un documento anterior a la spec 051 genera la miniatura la primera vez y la guarda', async () => {
    const { token, receipt, user } = await setup();
    const content = await photo(1600, 1200);
    await db.insert(receiptDocuments).values({ userId: user.id, receiptId: receipt.id, mimeType: 'image/jpeg', sizeBytes: content.length, sha256: 'a'.repeat(64), originalFilename: 'antiguo.jpg', content });

    const res = await thumbnail(token, receipt.id).expect(200);
    expect((await sharp(res.body as Buffer).metadata()).width).toBe(480);
    const [row] = await db.select({ thumbnail: receiptDocuments.thumbnail }).from(receiptDocuments).where(eq(receiptDocuments.receiptId, receipt.id));
    expect(Buffer.compare(row.thumbnail!, res.body as Buffer)).toBe(0);
  });

  it('PDF, imagen dañada (sin reintentar) o ticket sin documento → 404', async () => {
    const { token, receipt, user } = await setup();
    await thumbnail(token, receipt.id).expect(404);

    await upload(token, receipt.id, PDF, 'factura.pdf');
    await thumbnail(token, receipt.id).expect(404);

    await db.delete(receiptDocuments).where(eq(receiptDocuments.receiptId, receipt.id));
    await db.insert(receiptDocuments).values({ userId: user.id, receiptId: receipt.id, mimeType: 'image/jpeg', sizeBytes: BROKEN_JPEG.length, sha256: 'a'.repeat(64), originalFilename: 'roto.jpg', content: BROKEN_JPEG });
    await thumbnail(token, receipt.id).expect(404);
    const [row] = await db.select({ thumbnail: receiptDocuments.thumbnail }).from(receiptDocuments).where(eq(receiptDocuments.receiptId, receipt.id));
    expect(row.thumbnail!.length).toBe(0);
    await thumbnail(token, receipt.id).expect(404);
  });

  it('sustituir el documento cambia la miniatura', async () => {
    const { token, receipt } = await setup();
    await upload(token, receipt.id, await photo(1000, 500));
    const first = (await thumbnail(token, receipt.id).expect(200)).body as Buffer;
    await upload(token, receipt.id, await photo(500, 1000));
    const second = (await thumbnail(token, receipt.id).expect(200)).body as Buffer;
    expect((await sharp(first).metadata()).width).toBe(480);
    expect((await sharp(second).metadata()).height).toBe(480);
  });

  it('aislamiento: la miniatura de otro usuario da 404', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    await upload(bea.token, bea.receipt.id, await photo(800, 600));
    await thumbnail(ana.token, bea.receipt.id).expect(404);
  });
});
