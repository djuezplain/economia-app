import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { receiptDocuments, receipts, supermarkets, users } from '../src/db/schema/index.js';
import { ReceiptOcrService } from '../src/receipt-import/receipt-ocr.service.js';
import { JPEG, PDF } from './support/documents.js';

const TICKET_TEXT = ['MEDIA MARKT', '15/10/2026 18:42', 'LAVADORA BOSCH SERIE 6 549,00', 'TOTAL 549,00'].join('\n');

/** Spec 051 H3: el texto reconocido de los documentos. */
describe('Texto del documento (e2e) — spec 051 H3', () => {
  let app: INestApplication<App>;
  let db: Database;
  const extractTextMock = vi.fn<(buffer: Buffer, mimeType?: string) => Promise<string>>();
  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReceiptOcrService)
      .useValue({ extractText: extractTextMock })
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
    extractTextMock.mockReset();
    extractTextMock.mockResolvedValue(TICKET_TEXT);
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
    request(server()).put(`/receipts/${receiptId}/document`).set('Authorization', token).attach('file', content, name);
  const getText = (token: string, receiptId: string) => request(server()).get(`/receipts/${receiptId}/document/text`).set('Authorization', token);
  const readText = (token: string, receiptId: string) => request(server()).post(`/receipts/${receiptId}/document/text`).set('Authorization', token);

  it('confirmar una importación guarda el texto reconocido con el documento', async () => {
    const { token } = await setup();
    const preview = await request(server()).post('/receipt-import/preview').set('Authorization', token).attach('file', JPEG, 'ticket.jpg').expect(201);
    const confirm = await request(server())
      .post('/receipt-import/confirm')
      .set('Authorization', token)
      .send({ supermarket: { name: 'Media Markt' }, date: '2026-10-15', printedTotal: '549.00', lines: [], documentId: preview.body.document.id })
      .expect(201);

    const detail = await request(server()).get(`/receipts/${confirm.body.receiptId}`).set('Authorization', token).expect(200);
    expect(detail.body.document).toMatchObject({ hasText: true, textReadAt: expect.any(String) });
    const text = await getText(token, confirm.body.receiptId).expect(200);
    expect(text.body).toEqual({ text: TICKET_TEXT, readAt: expect.any(String) });
  });

  it('adjuntar y sustituir un documento leen su texto, el del documento nuevo', async () => {
    const { token, receipt } = await setup();
    const first = await upload(token, receipt.id, JPEG).expect(200);
    expect(first.body).toMatchObject({ hasText: true });
    expect(first.body).not.toHaveProperty('ocrWarning');
    expect(extractTextMock).toHaveBeenLastCalledWith(JPEG, 'image/jpeg');

    extractTextMock.mockResolvedValue('FACTURA IBERDROLA');
    await upload(token, receipt.id, PDF, 'factura.pdf').expect(200);
    expect(extractTextMock).toHaveBeenLastCalledWith(PDF, 'application/pdf');
    expect((await getText(token, receipt.id).expect(200)).body.text).toBe('FACTURA IBERDROLA');
  });

  it('si el OCR falla al adjuntar, el documento se guarda sin texto y se avisa; sin Vision configurado, con otro aviso', async () => {
    const { token, receipt } = await setup();
    extractTextMock.mockRejectedValue(new Error('Google Cloud Vision respondió 429'));
    const res = await upload(token, receipt.id, JPEG).expect(200);
    expect(res.body).toMatchObject({ hasText: false, textReadAt: null, ocrWarning: expect.stringContaining('no se ha podido leer su texto') });
    expect(await db.select().from(receiptDocuments).where(eq(receiptDocuments.receiptId, receipt.id))).toHaveLength(1);

    extractTextMock.mockRejectedValue(new ServiceUnavailableException('Sin clave'));
    const notConfigured = await upload(token, receipt.id, JPEG).expect(200);
    expect(notConfigured.body.ocrWarning).toContain('no está configurado');
  });

  it('un documento sin texto (anterior a la spec 051) se puede leer a petición; también uno ya leído', async () => {
    const { token, receipt, user } = await setup();
    await db.insert(receiptDocuments).values({
      userId: user.id, receiptId: receipt.id, mimeType: 'image/jpeg', sizeBytes: JPEG.length, sha256: 'a'.repeat(64), originalFilename: 'antiguo.jpg', content: JPEG,
    });
    const before = await request(server()).get(`/receipts/${receipt.id}`).set('Authorization', token).expect(200);
    expect(before.body.document).toMatchObject({ hasText: false, textReadAt: null });
    expect((await getText(token, receipt.id).expect(200)).body).toEqual({ text: null, readAt: null });

    const read = await readText(token, receipt.id).expect(200);
    expect(read.body).toEqual({ text: TICKET_TEXT, readAt: expect.any(String) });
    expect(extractTextMock).toHaveBeenCalledTimes(1);

    // Leído pero sin texto: queda constancia de que se leyó.
    extractTextMock.mockResolvedValue('   ');
    expect((await readText(token, receipt.id).expect(200)).body).toEqual({ text: '', readAt: expect.any(String) });
    const after = await request(server()).get(`/receipts/${receipt.id}`).set('Authorization', token).expect(200);
    expect(after.body.document).toMatchObject({ hasText: false, textReadAt: expect.any(String) });
  });

  it('releer: 503 sin Vision configurado, 502 si Vision falla, 404 sin documento; nunca pierde el texto anterior por un fallo', async () => {
    const { token, receipt } = await setup();
    await readText(token, receipt.id).expect(404);
    await upload(token, receipt.id, JPEG).expect(200);

    extractTextMock.mockRejectedValue(new ServiceUnavailableException('El reconocimiento de tickets no está configurado (falta GOOGLE_CLOUD_VISION_API_KEY).'));
    expect((await readText(token, receipt.id).expect(503)).body.message).toContain('no está configurado');
    extractTextMock.mockRejectedValue(new Error('respondió 500'));
    expect((await readText(token, receipt.id).expect(502)).body.message).toBe('No se ha podido leer el texto del documento. Inténtalo de nuevo más tarde.');
    expect((await getText(token, receipt.id).expect(200)).body.text).toBe(TICKET_TEXT);
  });

  it('aislamiento: el texto del documento de otro usuario da 404 y no llama a Vision', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    await upload(bea.token, bea.receipt.id, JPEG).expect(200);
    extractTextMock.mockClear();
    await getText(ana.token, bea.receipt.id).expect(404);
    await readText(ana.token, bea.receipt.id).expect(404);
    expect(extractTextMock).not.toHaveBeenCalled();
  });
});
