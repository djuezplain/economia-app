import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { products, receiptLines, receipts, supermarkets, users } from '../src/db/schema/index.js';

/**
 * Imagen sintética renderizada con SVG (plan.md §14): nunca el ticket real
 * de Diego. Reproduce cabecera + supermercado + líneas de producto + TOTAL,
 * suficiente para ejercitar el pipeline de OCR real (sin mocks) de extremo
 * a extremo en `preview`.
 */
async function buildSyntheticTicketImage(lines: string[]): Promise<Buffer> {
  const paperWidth = 520;
  const paperHeight = 60 + lines.length * 36;
  const margin = 100;
  const totalWidth = paperWidth + margin * 2;
  const totalHeight = paperHeight + margin * 2;
  const textElements = lines
    .map((line, index) => `<text x="${margin + 20}" y="${margin + 40 + index * 36}" font-family="monospace" font-size="24" fill="black">${line}</text>`)
    .join('\n');
  const svg = `
    <svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${totalWidth}" height="${totalHeight}" fill="#334455"/>
      <rect x="${margin}" y="${margin}" width="${paperWidth}" height="${paperHeight}" fill="white"/>
      ${textElements}
    </svg>
  `;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

describe('Importar tickets escaneados por OCR (e2e) — spec 034', () => {
  let app: INestApplication<App>;
  let db: Database;
  let ticketImage: Buffer;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = moduleFixture.get<Database>(DB);
    ticketImage = await buildSyntheticTicketImage([
      'MERCADONA, S.A.',
      '01/04/2026 16:10',
      'Descripcion P.Unit Imp.',
      '1 CHOCOLATE CLASSIC 1,30',
      '2 NACHOS 0,90 1,80',
      'TOTAL 3,10',
    ]);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(users);
  });

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  it('sin autenticar, responde 401 en preview y confirm', async () => {
    await request(app.getHttpServer()).post('/receipt-import/preview').attach('file', ticketImage, 'ticket.jpg').expect(401);
    await request(app.getHttpServer())
      .post('/receipt-import/confirm')
      .send({ supermarket: { name: 'Mercadona' }, date: '2026-04-01', lines: [] })
      .expect(401);
  });

  it('con la cuenta sin verificar, responde 403', async () => {
    const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
    const token = await login(user.email);
    await request(app.getHttpServer())
      .post('/receipt-import/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', ticketImage, 'ticket.jpg')
      .expect(403);
  });

  describe('preview', () => {
    it('reconoce supermercado, fecha, líneas y total, sin escribir nada', async () => {
      const user = await createUser('preview@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/receipt-import/preview')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', ticketImage, 'ticket.jpg')
        .expect(201);

      expect(res.body.supermarket).toEqual({ matchedId: null, suggestedName: 'MERCADONA, S.A.' });
      expect(res.body.date).toBe('2026-04-01');
      expect(res.body.warnings).not.toContain('No se ha podido leer la fecha del ticket.');
      expect(res.body.lines).toHaveLength(2);
      const chocolate = res.body.lines.find((l: { description: string }) => l.description === 'CHOCOLATE CLASSIC');
      expect(chocolate).toMatchObject({ quantity: '1', unit: 'unidad', pricePerUnit: '1.300', amount: '1.30' });
      const nachos = res.body.lines.find((l: { description: string }) => l.description === 'NACHOS');
      expect(nachos).toMatchObject({ quantity: '2', unit: 'unidad', pricePerUnit: '0.900', amount: '1.80' });
      expect(res.body.linesTotal).toBe('3.10');
      expect(res.body.printedTotal).toBe('3.10');

      const receiptRows = await db.select().from(receipts).where(eq(receipts.userId, user.id));
      expect(receiptRows).toHaveLength(0);
    }, 20000);

    it('sugiere un supermercado ya existente del usuario en vez de uno nuevo', async () => {
      const user = await createUser('preview-existente@example.com');
      const token = await login(user.email);
      const [existing] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona, S.A.' }).returning();

      const res = await request(app.getHttpServer())
        .post('/receipt-import/preview')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', ticketImage, 'ticket.jpg')
        .expect(201);

      expect(res.body.supermarket).toEqual({ matchedId: existing.id, suggestedName: null });
    }, 20000);

    it('un fichero que no es imagen responde 400', async () => {
      const user = await createUser('preview-invalido@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/receipt-import/preview')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('no soy una imagen'), { filename: 'ticket.txt', contentType: 'text/plain' })
        .expect(400);
    });

    it('una imagen sin ningún texto legible avisa en vez de devolver una vista previa vacía como si estuviera bien (H1 criterio 4)', async () => {
      const user = await createUser('preview-ilegible@example.com');
      const token = await login(user.email);
      const blankImage = await sharp({ create: { width: 300, height: 200, channels: 3, background: 'white' } })
        .jpeg()
        .toBuffer();

      const res = await request(app.getHttpServer())
        .post('/receipt-import/preview')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', blankImage, 'ticket.jpg')
        .expect(201);

      expect(res.body.lines).toEqual([]);
      expect(res.body.warnings).toContain('No se ha podido reconocer ninguna línea de producto en la imagen.');
    }, 20000);
  });

  describe('confirm', () => {
    it('crea supermercado y productos nuevos, y guarda el ticket con sus líneas', async () => {
      const user = await createUser('confirm@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/receipt-import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: { name: 'Mercadona' },
          date: '2026-04-01',
          printedTotal: '3.10',
          lines: [
            { description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.30', amount: '1.30', product: { name: 'Chocolate Classic' } },
            { description: 'NACHOS', quantity: '2', unit: 'unidad', pricePerUnit: '0.90', amount: '1.80', product: { name: 'Nachos' } },
          ],
        })
        .expect(201);

      const receiptId = res.body.receiptId as string;
      const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
      expect(receipt.userId).toBe(user.id);
      expect(receipt.printedTotal).toBe('3.10');

      const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
      expect(lines).toHaveLength(2);

      const supermarketRows = await db.select().from(supermarkets).where(eq(supermarkets.userId, user.id));
      expect(supermarketRows).toHaveLength(1);
      expect(supermarketRows[0].name).toBe('Mercadona');
    });

    it('reutiliza un producto ya existente en vez de duplicarlo', async () => {
      const user = await createUser('confirm-reutiliza@example.com');
      const token = await login(user.email);
      const [existingProduct] = await db.insert(products).values({ userId: user.id, name: 'Chocolate Classic' }).returning();

      await request(app.getHttpServer())
        .post('/receipt-import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: { name: 'Carrefour' },
          date: '2026-04-02',
          lines: [{ description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.40', amount: '1.40', product: { id: existingProduct.id } }],
        })
        .expect(201);

      const productRows = await db.select().from(products).where(eq(products.userId, user.id));
      expect(productRows).toHaveLength(1);

      const lines = await db.select().from(receiptLines).where(eq(receiptLines.productId, existingProduct.id));
      expect(lines).toHaveLength(1);
      expect(lines[0].pricePerUnit).toBe('1.400');
    });

    it('un id de supermercado de otro usuario responde 404 y no escribe nada (aislamiento)', async () => {
      const otherUser = await createUser('otro@example.com');
      const [otherSupermarket] = await db.insert(supermarkets).values({ userId: otherUser.id, name: 'Mercadona' }).returning();

      const user = await createUser('confirm-aislamiento@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/receipt-import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: { id: otherSupermarket.id },
          date: '2026-04-01',
          lines: [{ description: 'AGUA', quantity: '1', unit: 'unidad', pricePerUnit: '0.50', amount: '0.50', product: { name: 'Agua' } }],
        })
        .expect(404);

      const receiptRows = await db.select().from(receipts).where(eq(receipts.userId, user.id));
      expect(receiptRows).toHaveLength(0);
      const productRows = await db.select().from(products).where(eq(products.userId, user.id));
      expect(productRows).toHaveLength(0);
    });

    it('sin id ni nombre en el supermercado, responde 400', async () => {
      const user = await createUser('confirm-sin-ref@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/receipt-import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: {},
          date: '2026-04-01',
          lines: [{ description: 'AGUA', quantity: '1', unit: 'unidad', pricePerUnit: '0.50', amount: '0.50', product: { name: 'Agua' } }],
        })
        .expect(400);
    });

    it('una unidad inválida en una línea responde 400 (validación del DTO)', async () => {
      const user = await createUser('confirm-unidad-invalida@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/receipt-import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: { name: 'Mercadona' },
          date: '2026-04-01',
          lines: [{ description: 'AGUA', quantity: '1', unit: 'litro', pricePerUnit: '0.50', amount: '0.50', product: { name: 'Agua' } }],
        })
        .expect(400);
    });
  });
});
