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
import { receiptDocuments, receipts, supermarkets, users } from '../src/db/schema/index.js';
import { ReceiptDocumentsService } from '../src/groceries/receipt-documents.service.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';
import { binaryParser, buildZip, readZip } from './support/zip.js';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';

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
    // Spec 050 H2: datos.json trae también la clave de ventas de fondos.
    expect(JSON.parse(entries.get('datos.json')!.toString('utf-8')).economicData.fundSales).toEqual([]);
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

  describe('importar el .zip (T6.3)', () => {
    function importZip(token: string, content: Buffer, step: 'preview' | 'confirm' = 'confirm', filename = 'copia.zip') {
      return request(app.getHttpServer()).post(`/data-import/${step}`).set('Authorization', token).attach('file', content, filename);
    }

    const tempFiles = () => readdirSync(tmpdir()).filter((f) => f.startsWith('economia-import-'));

    it('ida y vuelta: exportar, borrar la cuenta y restaurar en otra cuenta, con los documentos intactos', async () => {
      const ana = await setup('ana@example.com');
      await ana.addReceipt(JPEG, 'ticket.jpg');
      await ana.addReceipt(PDF, 'factura.pdf');
      const archive = (await download(ana.token)).body as Buffer;
      await db.delete(users).where(eq(users.id, ana.user.id));

      const bea = await setup('bea@example.com');
      const preview = await importZip(bea.token, archive, 'preview').expect(201);
      expect(preview.body.receiptDocuments).toEqual({ total: 2, toImport: 2, alreadyExisting: 0, omitted: 0 });
      expect(await db.select({ id: receiptDocuments.id }).from(receiptDocuments).where(eq(receiptDocuments.userId, bea.user.id))).toEqual([]);

      const res = await importZip(bea.token, archive).expect(201);
      expect(res.body).toMatchObject({ receipts: { toImport: 2 }, receiptDocuments: { toImport: 2, omitted: 0 } });
      const restored = await db.select().from(receiptDocuments).where(eq(receiptDocuments.userId, bea.user.id));
      expect(restored.map((d) => d.mimeType).sort()).toEqual(['application/pdf', 'image/jpeg']);
      expect(Buffer.compare(restored.find((d) => d.mimeType === 'image/jpeg')!.content, JPEG)).toBe(0);

      const again = await importZip(bea.token, archive).expect(201);
      expect(again.body.receiptDocuments).toMatchObject({ toImport: 0, alreadyExisting: 2 });
      expect(tempFiles()).toEqual([]);
    });

    it('un documento cuyo contenido no coincide con su SHA-256 se omite y se cuenta; el resto sí se importa', async () => {
      const ana = await setup('ana@example.com');
      await ana.addReceipt(JPEG, 'ticket.jpg');
      await ana.addReceipt(PDF, 'factura.pdf');
      const entries = await readZip((await download(ana.token)).body as Buffer);
      await db.delete(users).where(eq(users.id, ana.user.id));
      const data = JSON.parse(entries.get('datos.json')!.toString());
      const jpegMeta = data.economicData.receiptDocuments.find((d: { mimeType: string }) => d.mimeType === 'image/jpeg');
      const tampered = Buffer.from(JPEG);
      tampered[5] ^= 0xff;
      entries.set(jpegMeta.file, tampered);

      const bea = await setup('bea@example.com');
      const res = await importZip(bea.token, await buildZip(Object.fromEntries(entries))).expect(201);
      expect(res.body.receiptDocuments).toEqual({ total: 2, toImport: 1, alreadyExisting: 0, omitted: 1 });
      expect(res.body.receipts.toImport).toBe(2);
    });

    it('un documento que no viene en el .zip, o un .json con documentos, se omite', async () => {
      const ana = await setup('ana@example.com');
      await ana.addReceipt(JPEG);
      const entries = await readZip((await download(ana.token)).body as Buffer);
      await db.delete(users).where(eq(users.id, ana.user.id));

      const bea = await setup('bea@example.com');
      const onlyData = await buildZip({ 'datos.json': entries.get('datos.json')! });
      expect((await importZip(bea.token, onlyData, 'preview').expect(201)).body.receiptDocuments).toMatchObject({ toImport: 0, omitted: 1 });
      const asJson = await importZip(bea.token, entries.get('datos.json')!, 'preview', 'copia.json').expect(201);
      expect(asJson.body.receiptDocuments).toMatchObject({ toImport: 0, omitted: 1 });
      expect(asJson.body.receipts.toImport).toBe(1);
    });

    it('rechaza (400) un .zip dañado, uno sin datos.json, otro tipo de fichero y un .json de más de 10 MB; siempre borra el temporal', async () => {
      const { token } = await setup();
      expect((await importZip(token, Buffer.from('no es un zip')).expect(400)).body.message).toBe('El fichero no es un .zip válido.');
      expect((await importZip(token, await buildZip({ 'otra.json': '{}' })).expect(400)).body.message).toBe('El .zip no contiene "datos.json".');
      await importZip(token, Buffer.from('{}'), 'confirm', 'copia.txt').expect(400);
      const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20);
      expect((await importZip(token, big, 'confirm', 'copia.json').expect(400)).body.message).toBe('Un fichero .json no puede ocupar más de 10 MB.');
      expect(tempFiles()).toEqual([]);
    });

    it('un documento con una ruta manipulada (otra entrada del .zip) invalida el fichero entero', async () => {
      const ana = await setup('ana@example.com');
      await ana.addReceipt(JPEG);
      const entries = await readZip((await download(ana.token)).body as Buffer);
      const data = JSON.parse(entries.get('datos.json')!.toString());
      data.economicData.receiptDocuments[0].file = '../../etc/passwd';
      entries.set('datos.json', Buffer.from(JSON.stringify(data)));
      await importZip(ana.token, await buildZip(Object.fromEntries(entries))).expect(400);
    });

    it('una entrada que miente sobre su tamaño aborta la importación sin escribir nada', async () => {
      const ana = await setup('ana@example.com');
      await ana.addReceipt(JPEG);
      const archive = (await download(ana.token)).body as Buffer;
      await db.delete(users).where(eq(users.id, ana.user.id));
      const data = JSON.parse((await readZip(archive)).get('datos.json')!.toString());
      const meta = data.economicData.receiptDocuments[0];
      // Se declara un tamaño menor que el real en las cabeceras de esa entrada.
      const bytes = Buffer.from(archive);
      const name = Buffer.from(meta.file);
      const central = bytes.lastIndexOf(name) - 46;
      // Solo el tamaño descomprimido: el contenido real es más largo.
      bytes.writeUInt32LE(3, central + 24);
      const local = bytes.indexOf(name) - 30;
      bytes.writeUInt32LE(3, local + 22);

      const bea = await setup('bea@example.com');
      await importZip(bea.token, bytes).expect(400);
      expect(await db.select().from(receipts).where(eq(receipts.userId, bea.user.id))).toEqual([]);
    });
  });
});
