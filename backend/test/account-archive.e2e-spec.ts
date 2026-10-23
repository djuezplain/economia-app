import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { receipts, supermarkets, users } from '../src/db/schema/index.js';
import { ReceiptDocumentsService } from '../src/groceries/receipt-documents.service.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';
import { binaryParser, readZip } from './support/zip.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('foto de prueba')]);
const PDF = Buffer.from('%PDF-1.7\n<< /Type /Page >>\n%%EOF');

/** Spec 048 T6.2: la copia de seguridad en `.zip`, con los documentos. */
describe('Exportación en .zip (e2e) — spec 048', () => {
  let app: INestApplication<App>;
  let db: Database;
  let documents: ReceiptDocumentsService;
  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    app.get(RateLimitGuard).resetForTests();
  });

  async function setup(email = 'ana@example.com') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    const [shop] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
    const addReceipt = async (content: Buffer | null, filename = 'ticket.jpg') => {
      const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: shop.id, date: '2026-10-15', printedTotal: '1.00' }).returning();
      if (content) await documents.replace(user.id, receipt.id, await documents.prepare(content, filename));
      return receipt;
    };
    return { user, token: `Bearer ${res.body.accessToken as string}`, addReceipt };
  }

  function download(token: string) {
    return request(app.getHttpServer()).get('/users/me/export/archive').set('Authorization', token).buffer(true).parse(binaryParser).expect(200);
  }

  it('trae datos.json y cada documento en su ruta, con el SHA-256 de sus metadatos', async () => {
    const { user, token, addReceipt } = await setup();
    await addReceipt(JPEG, 'ticket.jpg');
    await addReceipt(PDF, 'factura.pdf');
    await addReceipt(null);
    // Un pendiente (vista previa sin confirmar) no es un dato: no se exporta.
    await documents.storePending(user.id, await documents.prepare(JPEG, 'pendiente.jpg'));

    const res = await download(token);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="economia-app-datos-\d{4}-\d{2}-\d{2}\.zip"$/);

    const entries = await readZip(res.body as Buffer);
    const data = JSON.parse(entries.get('datos.json')!.toString('utf-8')) as { economicData: { receipts: unknown[]; receiptDocuments: Array<{ file: string; sha256: string; sizeBytes: number; mimeType: string }> } };
    expect(data.economicData.receipts).toHaveLength(3);
    expect(data.economicData.receiptDocuments).toHaveLength(2);
    expect([...entries.keys()].sort()).toEqual(['datos.json', ...data.economicData.receiptDocuments.map((d) => d.file)].sort());
    for (const meta of data.economicData.receiptDocuments) {
      const content = entries.get(meta.file)!;
      expect(meta.file).toMatch(meta.mimeType === 'application/pdf' ? /^documentos\/[0-9a-f-]+\.pdf$/ : /^documentos\/[0-9a-f-]+\.jpg$/);
      expect(content.length).toBe(meta.sizeBytes);
      expect(createHash('sha256').update(content).digest('hex')).toBe(meta.sha256);
      expect(meta).not.toHaveProperty('content');
    }
  });

  it('una cuenta sin documentos solo trae datos.json', async () => {
    const { token } = await setup();
    const entries = await readZip((await download(token)).body as Buffer);
    expect([...entries.keys()]).toEqual(['datos.json']);
  });

  it('aislamiento: solo se exportan los documentos propios', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    await ana.addReceipt(JPEG);
    await bea.addReceipt(PDF);

    const entries = await readZip((await download(bea.token)).body as Buffer);
    const files = [...entries.keys()].filter((k) => k !== 'datos.json');
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.pdf$/);
  });

  it('sin autenticar, 401', async () => {
    await request(app.getHttpServer()).get('/users/me/export/archive').expect(401);
  });
});
