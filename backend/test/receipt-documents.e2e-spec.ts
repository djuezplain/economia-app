import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { readFileSync } from 'node:fs';
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
import { ReceiptDocumentsService } from '../src/groceries/receipt-documents.service.js';

/** Cabeceras reales de cada formato, con algo de relleno: el contenido no se interpreta salvo en HEIC. */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg de prueba')]);
export const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n%%EOF');
const HEIC = readFileSync(new URL('../src/groceries/__fixtures__/ticket-pequeno.heic', import.meta.url));
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe('Documentos de tickets (e2e) — spec 048 H1', () => {
  let app: INestApplication<App>;
  let db: Database;
  let documents: ReceiptDocumentsService;
  const extractTextMock = vi.fn<() => Promise<string>>();

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
    documents = moduleFixture.get(ReceiptDocumentsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(users);
    extractTextMock.mockReset();
    extractTextMock.mockResolvedValue(['MERCADONA, S.A.', '01/04/2026 16:10', 'Descripcion P.Unit Imp.', '1 CHOCOLATE CLASSIC 1,30', 'TOTAL 1,30'].join('\n'));
  });

  async function createUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken as string}`;
  }

  async function createReceipt(userId: string) {
    const [shop] = await db.insert(supermarkets).values({ userId, name: 'Mercadona' }).returning();
    const [receipt] = await db.insert(receipts).values({ userId, supermarketId: shop.id, date: '2026-04-01', printedTotal: '1.30' }).returning();
    return receipt;
  }

  describe('servicio (T3.1)', () => {
    it('guarda un pendiente con su tipo, tamaño, SHA-256 y nombre', async () => {
      const user = await createUser('ana@example.com');
      const info = await documents.storePending(user.id, await documents.prepare(JPEG, 'ticket.jpg'));
      expect(info).toMatchObject({ mimeType: 'image/jpeg', sizeBytes: JPEG.length, originalFilename: 'ticket.jpg', pageCount: null });

      const [row] = await db.select().from(receiptDocuments).where(eq(receiptDocuments.id, info.id));
      expect(row.receiptId).toBeNull();
      expect(Buffer.compare(row.content, JPEG)).toBe(0);
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('cuenta las páginas de un PDF', async () => {
      const prepared = await documents.prepare(PDF, 'factura.pdf');
      expect(prepared).toMatchObject({ mimeType: 'application/pdf', pageCount: 2 });
    });

    it('rechaza (400) lo que no es una foto o un PDF, aunque se llame .jpg', async () => {
      await expect(documents.prepare(SVG, 'ticket.jpg')).rejects.toMatchObject({ status: 400 });
    });

    it('rechaza (400) un documento de más de 10 MB', async () => {
      const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]);
      await expect(documents.prepare(big, 'enorme.jpg')).rejects.toMatchObject({ status: 400 });
    });

    it('guarda un HEIC convertido a JPEG, con la extensión cambiada', async () => {
      const prepared = await documents.prepare(HEIC, 'IMG_0001.HEIC');
      expect(prepared.mimeType).toBe('image/jpeg');
      expect(prepared.content.subarray(0, 3).toString('hex')).toBe('ffd8ff');
      expect(prepared.originalFilename).toBe('IMG_0001.jpg');
    }, 30_000);

    it('la purga borra solo los pendientes de más de 24 horas, nunca uno ya asociado', async () => {
      const user = await createUser('ana@example.com');
      const receipt = await createReceipt(user.id);
      const prepared = await documents.prepare(JPEG, 'a.jpg');
      const reciente = await documents.storePending(user.id, prepared);
      const viejo = await documents.storePending(user.id, prepared);
      const asociadoViejo = await documents.storePending(user.id, prepared);
      const hace25h = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await db.update(receiptDocuments).set({ createdAt: hace25h }).where(eq(receiptDocuments.id, viejo.id));
      await db.update(receiptDocuments).set({ createdAt: hace25h, receiptId: receipt.id }).where(eq(receiptDocuments.id, asociadoViejo.id));

      expect(await documents.purgeStalePending()).toBe(1);
      const left = (await db.select({ id: receiptDocuments.id }).from(receiptDocuments)).map((r) => r.id).sort();
      expect(left).toEqual([reciente.id, asociadoViejo.id].sort());
    });
  });

  describe('vista previa y confirmación (T3.2)', () => {
    function preview(token: string, file: Buffer, filename = 'ticket.jpg') {
      return request(app.getHttpServer()).post('/receipt-import/preview').set('Authorization', token).attach('file', file, filename);
    }

    function confirm(token: string, body: object) {
      return request(app.getHttpServer()).post('/receipt-import/confirm').set('Authorization', token).send(body);
    }

    const ticket = (extra: object = {}) => ({
      supermarket: { name: 'Mercadona' },
      date: '2026-04-01',
      printedTotal: '1.30',
      lines: [{ description: 'CHOCOLATE', quantity: '1', unit: 'unidad', pricePerUnit: '1.300', amount: '1.30', product: { name: 'Chocolate' } }],
      ...extra,
    });

    it('la vista previa guarda el documento como pendiente y lo devuelve; confirmar lo asocia al ticket', async () => {
      const user = await createUser('ana@example.com');
      const token = await login(user.email);
      const res = await preview(token, JPEG).expect(201);
      expect(res.body.document).toMatchObject({ mimeType: 'image/jpeg', sizeBytes: JPEG.length });
      const documentId = res.body.document.id as string;
      expect((await db.select().from(receiptDocuments).where(eq(receiptDocuments.id, documentId)))[0].receiptId).toBeNull();

      const saved = await confirm(token, ticket({ documentId })).expect(201);
      const [row] = await db.select().from(receiptDocuments).where(eq(receiptDocuments.id, documentId));
      expect(row.receiptId).toBe(saved.body.receiptId);
    });

    it('acepta un PDF (el OCR recibe el tipo detectado)', async () => {
      const user = await createUser('ana@example.com');
      const token = await login(user.email);
      const res = await preview(token, PDF, 'factura.pdf').expect(201);
      expect(res.body.document).toMatchObject({ mimeType: 'application/pdf', pageCount: 2 });
      expect(extractTextMock).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
    });

    it('avisa si el PDF tiene más de 5 páginas, pero lo guarda entero', async () => {
      const user = await createUser('ana@example.com');
      const token = await login(user.email);
      const sevenPages = Buffer.from(`%PDF-1.7\n${'<< /Type /Page >>\n'.repeat(7)}%%EOF`);
      const res = await preview(token, sevenPages, 'factura.pdf').expect(201);
      expect(res.body.warnings).toContain('El PDF tiene 7 páginas: solo se han leído las 5 primeras. El documento se guarda entero.');
      expect(res.body.document).toMatchObject({ pageCount: 7, sizeBytes: sevenPages.length });
    });

    it('guarda el documento aunque el OCR no reconozca nada', async () => {
      extractTextMock.mockResolvedValue('');
      const user = await createUser('ana@example.com');
      const token = await login(user.email);
      const res = await preview(token, JPEG).expect(201);
      expect(res.body.lines).toEqual([]);
      expect(res.body.document.id).toBeDefined();
    });

    it('si el OCR falla no deja ningún pendiente', async () => {
      extractTextMock.mockRejectedValue(new Error('Vision caído'));
      const user = await createUser('ana@example.com');
      const token = await login(user.email);
      await preview(token, JPEG).expect(500);
      expect(await db.select().from(receiptDocuments)).toEqual([]);
    });

    it('rechaza (400) un fichero que no es foto ni PDF, y uno de más de 10 MB con mensaje en español', async () => {
      const user = await createUser('ana@example.com');
      const token = await login(user.email);
      await preview(token, SVG, 'ticket.png').expect(400);
      const big = await preview(token, Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)])).expect(400);
      expect(big.body.message).toBe('El documento ocupa más de 10 MB.');
      expect(extractTextMock).not.toHaveBeenCalled();
    });

    it('confirmar con un documento de otro usuario, ya usado o inexistente → 400 y no guarda el ticket', async () => {
      const ana = await createUser('ana@example.com');
      const bea = await createUser('bea@example.com');
      const anaToken = await login(ana.email);
      const beaToken = await login(bea.email);
      const deAna = (await preview(anaToken, JPEG).expect(201)).body.document.id as string;

      await confirm(beaToken, ticket({ documentId: deAna })).expect(400);
      await confirm(beaToken, ticket({ documentId: '00000000-0000-4000-8000-000000000000' })).expect(400);
      await confirm(anaToken, ticket({ documentId: deAna })).expect(201);
      await confirm(anaToken, ticket({ documentId: deAna })).expect(400);

      expect(await db.select().from(receipts).where(eq(receipts.userId, bea.id))).toEqual([]);
      expect(await db.select().from(receipts).where(eq(receipts.userId, ana.id))).toHaveLength(1);
    });

    it('si falla al guardar las líneas, el documento sigue pendiente (todo en la misma transacción)', async () => {
      const user = await createUser('ana@example.com');
      const token = await login(user.email);
      const documentId = (await preview(token, JPEG).expect(201)).body.document.id as string;
      const conProductoInexistente = ticket({
        documentId,
        lines: [{ description: 'X', quantity: '1', unit: 'unidad', pricePerUnit: '1.000', amount: '1.00', product: { id: '00000000-0000-4000-8000-000000000000' } }],
      });
      await confirm(token, conProductoInexistente).expect(404);

      const [row] = await db.select().from(receiptDocuments).where(eq(receiptDocuments.id, documentId));
      expect(row.receiptId).toBeNull();
      expect(await db.select().from(receipts)).toEqual([]);
    });
  });
});
