import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { products, receiptLines, receipts, supermarkets, users } from '../src/db/schema/index.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';

describe('Consulta de supermercados/productos/tickets (e2e) — spec 034, grupo 5', () => {
  let app: INestApplication<App>;
  let db: Database;
  let rateLimitGuard: RateLimitGuard;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = moduleFixture.get<Database>(DB);
    rateLimitGuard = moduleFixture.get<RateLimitGuard>(RateLimitGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(users);
    // Este fichero ya supera los 20 `login()` (límite real de
    // `POST /auth/login`, 20 cada 15 min) tras añadir los tests de spec 036
    // — mismo criterio ya documentado en `RateLimitGuard.resetForTests`
    // (encontrado antes en `transactions.e2e-spec.ts`).
    rateLimitGuard.resetForTests();
  });

  async function createUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  describe('GET /supermarkets', () => {
    it('lista solo los supermercados del usuario autenticado, alfabéticamente', async () => {
      const user = await createUser('super-1@example.com');
      const other = await createUser('super-2@example.com');
      await db.insert(supermarkets).values([
        { userId: user.id, name: 'Mercadona' },
        { userId: user.id, name: 'Carrefour' },
        { userId: other.id, name: 'Lidl' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/supermarkets').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.map((s: { name: string }) => s.name)).toEqual(['Carrefour', 'Mercadona']);
    });

    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/supermarkets').expect(401);
    });
  });

  describe('GET /products', () => {
    it('sin "search", lista todos los productos del usuario', async () => {
      const user = await createUser('prod-1@example.com');
      await db.insert(products).values([
        { userId: user.id, name: 'Chocolate Classic' },
        { userId: user.id, name: 'Nachos' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/products').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toHaveLength(2);
    });

    it('con "search", filtra por nombre (case-insensitive)', async () => {
      const user = await createUser('prod-2@example.com');
      await db.insert(products).values([
        { userId: user.id, name: 'Chocolate Classic' },
        { userId: user.id, name: 'Nachos' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/products?search=choco').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Chocolate Classic');
    });

    it('"search" sin coincidencias devuelve una lista vacía', async () => {
      const user = await createUser('prod-3@example.com');
      const token = await login(user.email);
      const res = await request(app.getHttpServer()).get('/products?search=inexistente').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /products/:id y PATCH /products/:id (spec 036, H2-H3)', () => {
    it('GET /products/:id devuelve la ficha del producto', async () => {
      const user = await createUser('prod-get-1@example.com');
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Chocolate Classic' }).returning();
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get(`/products/${product.id}`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toMatchObject({ id: product.id, name: 'Chocolate Classic' });
    });

    it('GET /products/:id de otro usuario responde 404', async () => {
      const owner = await createUser('prod-get-owner@example.com');
      const [product] = await db.insert(products).values({ userId: owner.id, name: 'Chocolate Classic' }).returning();
      const other = await createUser('prod-get-otro@example.com');
      const token = await login(other.email);

      await request(app.getHttpServer()).get(`/products/${product.id}`).set('Authorization', `Bearer ${token}`).expect(404);
    });

    it('PATCH /products/:id cambia el nombre, sin afectar a las líneas ya guardadas', async () => {
      const user = await createUser('prod-patch-1@example.com');
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Chocolate Classic' }).returning();
      const [supermarket] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: supermarket.id, date: '2026-04-01' }).returning();
      await db.insert(receiptLines).values({ receiptId: receipt.id, productId: product.id, description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.30', amount: '1.30' });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .patch(`/products/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Chocolate Classic Corregido' })
        .expect(200);
      expect(res.body.name).toBe('Chocolate Classic Corregido');

      const [line] = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id));
      expect(line.description).toBe('CHOCOLATE CLASSIC');
    });

    it('PATCH /products/:id a un nombre que coincide (normalizado) con otro producto propio responde 409, sin cambiar nada', async () => {
      const user = await createUser('prod-patch-dup@example.com');
      await db.insert(products).values({ userId: user.id, name: 'Nachos' }).returning();
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Chocolate Classic' }).returning();
      const token = await login(user.email);

      await request(app.getHttpServer()).patch(`/products/${product.id}`).set('Authorization', `Bearer ${token}`).send({ name: '  NACHOS  ' }).expect(409);

      const [unchanged] = await db.select().from(products).where(eq(products.id, product.id));
      expect(unchanged.name).toBe('Chocolate Classic');
    });

    it('PATCH /products/:id de otro usuario responde 404, nada cambia', async () => {
      const owner = await createUser('prod-patch-owner@example.com');
      const [product] = await db.insert(products).values({ userId: owner.id, name: 'Chocolate Classic' }).returning();
      const other = await createUser('prod-patch-otro@example.com');
      const token = await login(other.email);

      await request(app.getHttpServer()).patch(`/products/${product.id}`).set('Authorization', `Bearer ${token}`).send({ name: 'Otro nombre' }).expect(404);

      const [unchanged] = await db.select().from(products).where(eq(products.id, product.id));
      expect(unchanged.name).toBe('Chocolate Classic');
    });
  });

  describe('GET /products/:id/prices', () => {
    it('lista el precio del producto en cada supermercado, ordenado de más barato a más caro', async () => {
      const user = await createUser('precios-1@example.com');
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Leche' }).returning();
      const [mercadona] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [carrefour] = await db.insert(supermarkets).values({ userId: user.id, name: 'Carrefour' }).returning();
      const [receiptA] = await db.insert(receipts).values({ userId: user.id, supermarketId: mercadona.id, date: '2026-04-01' }).returning();
      const [receiptB] = await db.insert(receipts).values({ userId: user.id, supermarketId: carrefour.id, date: '2026-04-02' }).returning();
      await db.insert(receiptLines).values([
        { receiptId: receiptA.id, productId: product.id, description: 'Leche', quantity: '1', unit: 'unidad', pricePerUnit: '0.95', amount: '0.95' },
        { receiptId: receiptB.id, productId: product.id, description: 'Leche', quantity: '1', unit: 'unidad', pricePerUnit: '1.20', amount: '1.20' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get(`/products/${product.id}/prices`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ supermarketName: 'Mercadona', pricePerUnit: '0.950', amount: '0.95' });
      expect(res.body[1]).toMatchObject({ supermarketName: 'Carrefour', pricePerUnit: '1.200', amount: '1.20' });
    });

    it('un producto de otro usuario responde 404', async () => {
      const owner = await createUser('precios-owner@example.com');
      const [product] = await db.insert(products).values({ userId: owner.id, name: 'Leche' }).returning();

      const other = await createUser('precios-otro@example.com');
      const token = await login(other.email);

      await request(app.getHttpServer()).get(`/products/${product.id}/prices`).set('Authorization', `Bearer ${token}`).expect(404);
    });

    it('un producto sin ningún ticket devuelve una lista vacía', async () => {
      const user = await createUser('precios-vacio@example.com');
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Leche' }).returning();
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get(`/products/${product.id}/prices`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /products/merge (spec 038, H1)', () => {
    it('reasigna las líneas de los productos fusionados al superviviente y borra los demás', async () => {
      const user = await createUser('merge-1@example.com');
      const [survivor] = await db.insert(products).values({ userId: user.id, name: 'Leche entera' }).returning();
      const [loser] = await db.insert(products).values({ userId: user.id, name: 'leche' }).returning();
      const [supermarket] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: supermarket.id, date: '2026-04-01' }).returning();
      await db.insert(receiptLines).values({ receiptId: receipt.id, productId: loser.id, description: 'LECHE', quantity: '1', unit: 'unidad', pricePerUnit: '0.95', amount: '0.95' });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/products/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({ survivorId: survivor.id, mergedIds: [loser.id] })
        .expect(201);
      expect(res.body).toMatchObject({ id: survivor.id, name: 'Leche entera' });

      const [line] = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id));
      expect(line.productId).toBe(survivor.id);

      const remaining = await db.select().from(products).where(eq(products.userId, user.id));
      expect(remaining.map((p) => p.id)).toEqual([survivor.id]);
    });

    it('un producto fusionado que no existe o no es del usuario responde 404, sin cambiar nada', async () => {
      const user = await createUser('merge-2@example.com');
      const [survivor] = await db.insert(products).values({ userId: user.id, name: 'Leche entera' }).returning();
      const other = await createUser('merge-2-otro@example.com');
      const [ajeno] = await db.insert(products).values({ userId: other.id, name: 'leche' }).returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/products/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({ survivorId: survivor.id, mergedIds: [ajeno.id] })
        .expect(404);

      const stillThere = await db.select().from(products).where(eq(products.id, ajeno.id));
      expect(stillThere).toHaveLength(1);
    });

    it('un survivorId que no es del usuario responde 404', async () => {
      const owner = await createUser('merge-3-owner@example.com');
      const [ajeno] = await db.insert(products).values({ userId: owner.id, name: 'Leche entera' }).returning();
      const user = await createUser('merge-3@example.com');
      const [loser] = await db.insert(products).values({ userId: user.id, name: 'leche' }).returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/products/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({ survivorId: ajeno.id, mergedIds: [loser.id] })
        .expect(404);
    });
  });

  describe('GET /receipts', () => {
    it('lista los tickets del usuario, ordenados por fecha descendente', async () => {
      const user = await createUser('receipts-1@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      await db.insert(receipts).values([
        { userId: user.id, supermarketId: supermarket.id, date: '2026-04-01', printedTotal: '10.00' },
        { userId: user.id, supermarketId: supermarket.id, date: '2026-04-15', printedTotal: '20.00' },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/receipts').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.map((r: { date: string }) => r.date)).toEqual(['2026-04-15', '2026-04-01']);
      expect(res.body[0].supermarketName).toBe('Mercadona');
    });
  });

  describe('GET /receipts/:id', () => {
    it('muestra el detalle con sus líneas y el producto emparejado de cada una', async () => {
      const user = await createUser('receipt-detail@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Chocolate Classic' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: supermarket.id, date: '2026-04-01', printedTotal: '1.30' }).returning();
      await db.insert(receiptLines).values({ receiptId: receipt.id, productId: product.id, description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.30', amount: '1.30' });
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get(`/receipts/${receipt.id}`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.supermarketName).toBe('Mercadona');
      expect(res.body.lines).toHaveLength(1);
      expect(res.body.lines[0]).toMatchObject({ description: 'CHOCOLATE CLASSIC', productName: 'Chocolate Classic' });
    });

    it('un ticket de otro usuario responde 404', async () => {
      const owner = await createUser('receipt-owner@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: owner.id, name: 'Mercadona' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: owner.id, supermarketId: supermarket.id, date: '2026-04-01' }).returning();

      const other = await createUser('receipt-otro@example.com');
      const token = await login(other.email);

      await request(app.getHttpServer()).get(`/receipts/${receipt.id}`).set('Authorization', `Bearer ${token}`).expect(404);
    });
  });

  describe('PUT /receipts/:id (spec 035, H2-H3)', () => {
    it('actualiza fecha, supermercado y total, y sustituye todas las líneas por otras', async () => {
      const user = await createUser('update-1@example.com');
      const [mercadona] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [carrefour] = await db.insert(supermarkets).values({ userId: user.id, name: 'Carrefour' }).returning();
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Chocolate Classic' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: mercadona.id, date: '2026-04-01', printedTotal: '1.30' }).returning();
      await db.insert(receiptLines).values({ receiptId: receipt.id, productId: product.id, description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.30', amount: '1.30' });
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .put(`/receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: { id: carrefour.id },
          date: '2026-04-05',
          printedTotal: '2.50',
          lines: [{ description: 'AGUA', quantity: '1', unit: 'unidad', pricePerUnit: '0.50', amount: '0.50', product: { name: 'Agua' } }],
        })
        .expect(200);

      expect(res.body).toMatchObject({ date: '2026-04-05', supermarketId: carrefour.id, supermarketName: 'Carrefour', printedTotal: '2.50' });
      expect(res.body.lines).toHaveLength(1);
      expect(res.body.lines[0].description).toBe('AGUA');

      const lineRows = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id));
      expect(lineRows).toHaveLength(1);
      expect(lineRows[0].description).toBe('AGUA');
    });

    it('el precio corregido se refleja de inmediato en la comparativa de precios (H3 criterio 4)', async () => {
      const user = await createUser('update-2@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Leche' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: supermarket.id, date: '2026-04-01' }).returning();
      await db.insert(receiptLines).values({ receiptId: receipt.id, productId: product.id, description: 'Leche', quantity: '1', unit: 'unidad', pricePerUnit: '0.95', amount: '0.95' });
      const token = await login(user.email);

      await request(app.getHttpServer())
        .put(`/receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: { id: supermarket.id },
          date: '2026-04-01',
          lines: [{ description: 'Leche', quantity: '1', unit: 'unidad', pricePerUnit: '1.10', amount: '1.10', product: { id: product.id } }],
        })
        .expect(200);

      const prices = await request(app.getHttpServer()).get(`/products/${product.id}/prices`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(prices.body).toEqual([expect.objectContaining({ pricePerUnit: '1.100' })]);
    });

    it('un ticket de otro usuario responde 404 y no cambia nada', async () => {
      const owner = await createUser('update-owner@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: owner.id, name: 'Mercadona' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: owner.id, supermarketId: supermarket.id, date: '2026-04-01', printedTotal: '1.30' }).returning();

      const other = await createUser('update-otro@example.com');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .put(`/receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: { name: 'Otro' },
          date: '2026-04-02',
          lines: [{ description: 'AGUA', quantity: '1', unit: 'unidad', pricePerUnit: '0.50', amount: '0.50', product: { name: 'Agua' } }],
        })
        .expect(404);

      const [unchanged] = await db.select().from(receipts).where(eq(receipts.id, receipt.id));
      expect(unchanged.date).toBe('2026-04-01');
      expect(unchanged.printedTotal).toBe('1.30');
    });

    it('un producto de otro usuario en una línea responde 404 y no deja la transacción a medias', async () => {
      const owner = await createUser('update-line-owner@example.com');
      const [foreignProduct] = await db.insert(products).values({ userId: owner.id, name: 'Producto ajeno' }).returning();

      const user = await createUser('update-line@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: supermarket.id, date: '2026-04-01' }).returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .put(`/receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          supermarket: { id: supermarket.id },
          date: '2026-04-01',
          lines: [{ description: 'AGUA', quantity: '1', unit: 'unidad', pricePerUnit: '0.50', amount: '0.50', product: { id: foreignProduct.id } }],
        })
        .expect(404);

      const lineRows = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id));
      expect(lineRows).toHaveLength(0);
    });
  });

  describe('DELETE /receipts/:id (spec 035, H1)', () => {
    it('borra el ticket y sus líneas, sin tocar el producto ni el supermercado', async () => {
      const user = await createUser('delete-1@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Chocolate Classic' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: user.id, supermarketId: supermarket.id, date: '2026-04-01' }).returning();
      await db.insert(receiptLines).values({ receiptId: receipt.id, productId: product.id, description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.30', amount: '1.30' });
      const token = await login(user.email);

      await request(app.getHttpServer()).delete(`/receipts/${receipt.id}`).set('Authorization', `Bearer ${token}`).expect(204);

      const [deletedReceipt] = await db.select().from(receipts).where(eq(receipts.id, receipt.id));
      expect(deletedReceipt).toBeUndefined();
      const lineRows = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id));
      expect(lineRows).toHaveLength(0);

      const [survivingProduct] = await db.select().from(products).where(eq(products.id, product.id));
      expect(survivingProduct).toBeDefined();
      const [survivingSupermarket] = await db.select().from(supermarkets).where(eq(supermarkets.id, supermarket.id));
      expect(survivingSupermarket).toBeDefined();
    });

    it('no afecta a otro ticket que use el mismo producto', async () => {
      const user = await createUser('delete-2@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: user.id, name: 'Mercadona' }).returning();
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Leche' }).returning();
      const [receiptToDelete] = await db.insert(receipts).values({ userId: user.id, supermarketId: supermarket.id, date: '2026-04-01' }).returning();
      const [receiptToKeep] = await db.insert(receipts).values({ userId: user.id, supermarketId: supermarket.id, date: '2026-04-02' }).returning();
      await db.insert(receiptLines).values([
        { receiptId: receiptToDelete.id, productId: product.id, description: 'Leche', quantity: '1', unit: 'unidad', pricePerUnit: '0.95', amount: '0.95' },
        { receiptId: receiptToKeep.id, productId: product.id, description: 'Leche', quantity: '1', unit: 'unidad', pricePerUnit: '1.00', amount: '1.00' },
      ]);
      const token = await login(user.email);

      await request(app.getHttpServer()).delete(`/receipts/${receiptToDelete.id}`).set('Authorization', `Bearer ${token}`).expect(204);

      const remainingLines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptToKeep.id));
      expect(remainingLines).toHaveLength(1);
    });

    it('un ticket de otro usuario responde 404 y no se borra nada', async () => {
      const owner = await createUser('delete-owner@example.com');
      const [supermarket] = await db.insert(supermarkets).values({ userId: owner.id, name: 'Mercadona' }).returning();
      const [receipt] = await db.insert(receipts).values({ userId: owner.id, supermarketId: supermarket.id, date: '2026-04-01' }).returning();

      const other = await createUser('delete-otro@example.com');
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/receipts/${receipt.id}`).set('Authorization', `Bearer ${token}`).expect(404);

      const [stillThere] = await db.select().from(receipts).where(eq(receipts.id, receipt.id));
      expect(stillThere).toBeDefined();
    });
  });
});
