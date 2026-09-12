import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { products, receiptLines, receipts, supermarkets, users } from '../src/db/schema/index.js';

describe('Consulta de supermercados/productos/tickets (e2e) — spec 034, grupo 5', () => {
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
      expect(res.body[0]).toMatchObject({ supermarketName: 'Mercadona', pricePerUnit: '0.950' });
      expect(res.body[1]).toMatchObject({ supermarketName: 'Carrefour', pricePerUnit: '1.200' });
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
});
