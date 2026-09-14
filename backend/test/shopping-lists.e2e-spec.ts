import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { products, shoppingListItems, shoppingLists, users } from '../src/db/schema/index.js';

describe('Listas de la compra (e2e) — spec 039 H1', () => {
  let app: INestApplication<App>;
  let db: Database;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    await db.delete(shoppingListItems);
    await db.delete(shoppingLists);
    await db.delete(products);
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

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /shopping-lists', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/shopping-lists').expect(401);
    });

    it('lista solo las listas propias, con su nº de productos', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const [ownProduct] = await db.insert(products).values({ userId: owner.id, name: 'Leche' }).returning();
      const [ownList] = await db.insert(shoppingLists).values({ userId: owner.id, name: 'Compra semanal' }).returning();
      await db.insert(shoppingListItems).values({ shoppingListId: ownList.id, productId: ownProduct.id });
      await db.insert(shoppingLists).values({ userId: other.id, name: 'Otra lista' });
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/shopping-lists').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Compra semanal');
      expect(res.body[0].itemCount).toBe(1);
    });
  });

  describe('POST /shopping-lists', () => {
    it('crea una lista', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/shopping-lists')
        .set('Authorization', auth(token))
        .send({ name: 'Básicos' })
        .expect(201);

      expect(res.body.name).toBe('Básicos');
    });

    it('sin nombre → 400', async () => {
      const user = await createUser('sin-nombre@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer()).post('/shopping-lists').set('Authorization', auth(token)).send({}).expect(400);
    });
  });

  describe('GET /shopping-lists/:id', () => {
    it('devuelve el detalle con los productos ya añadidos, por nombre', async () => {
      const user = await createUser('detalle@example.com');
      const [productB] = await db.insert(products).values({ userId: user.id, name: 'Zanahorias' }).returning();
      const [productA] = await db.insert(products).values({ userId: user.id, name: 'Arroz' }).returning();
      const [list] = await db.insert(shoppingLists).values({ userId: user.id, name: 'Compra' }).returning();
      await db.insert(shoppingListItems).values([
        { shoppingListId: list.id, productId: productB.id },
        { shoppingListId: list.id, productId: productA.id },
      ]);
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get(`/shopping-lists/${list.id}`).set('Authorization', auth(token)).expect(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items.map((item: { productName: string }) => item.productName)).toEqual(['Arroz', 'Zanahorias']);
    });

    it('una lista ajena → 404', async () => {
      const owner = await createUser('propietario-get@example.com');
      const other = await createUser('otro-get@example.com');
      const [list] = await db.insert(shoppingLists).values({ userId: owner.id, name: 'Compra' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).get(`/shopping-lists/${list.id}`).set('Authorization', auth(token)).expect(404);
    });
  });

  describe('PATCH /shopping-lists/:id', () => {
    it('renombra la lista', async () => {
      const user = await createUser('renombrar@example.com');
      const [list] = await db.insert(shoppingLists).values({ userId: user.id, name: 'Compra' }).returning();
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .patch(`/shopping-lists/${list.id}`)
        .set('Authorization', auth(token))
        .send({ name: 'Compra semanal' })
        .expect(200);
      expect(res.body.name).toBe('Compra semanal');
    });

    it('una lista ajena → 404', async () => {
      const owner = await createUser('propietario-patch@example.com');
      const other = await createUser('otro-patch@example.com');
      const [list] = await db.insert(shoppingLists).values({ userId: owner.id, name: 'Compra' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/shopping-lists/${list.id}`)
        .set('Authorization', auth(token))
        .send({ name: 'Otro nombre' })
        .expect(404);
    });
  });

  describe('DELETE /shopping-lists/:id', () => {
    it('elimina la lista y, en cascada, sus items', async () => {
      const user = await createUser('eliminar@example.com');
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Leche' }).returning();
      const [list] = await db.insert(shoppingLists).values({ userId: user.id, name: 'Compra' }).returning();
      await db.insert(shoppingListItems).values({ shoppingListId: list.id, productId: product.id });
      const token = await login(user.email);

      await request(app.getHttpServer()).delete(`/shopping-lists/${list.id}`).set('Authorization', auth(token)).expect(204);

      const remainingLists = await db.query.shoppingLists.findMany({ where: (l, { eq }) => eq(l.userId, user.id) });
      expect(remainingLists).toHaveLength(0);
      const remainingItems = await db.query.shoppingListItems.findMany({ where: (i, { eq }) => eq(i.shoppingListId, list.id) });
      expect(remainingItems).toHaveLength(0);
    });

    it('una lista ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [list] = await db.insert(shoppingLists).values({ userId: owner.id, name: 'Compra' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/shopping-lists/${list.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.shoppingLists.findFirst({ where: (l, { eq }) => eq(l.id, list.id) });
      expect(stillThere).toBeDefined();
    });
  });

  describe('POST /shopping-lists/:id/items', () => {
    it('añade un producto a la lista', async () => {
      const user = await createUser('anadir@example.com');
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Leche' }).returning();
      const [list] = await db.insert(shoppingLists).values({ userId: user.id, name: 'Compra' }).returning();
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post(`/shopping-lists/${list.id}/items`)
        .set('Authorization', auth(token))
        .send({ productId: product.id })
        .expect(201);
      expect(res.body.productName).toBe('Leche');
    });

    it('H1 criterio 4: el mismo producto dos veces → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Leche' }).returning();
      const [list] = await db.insert(shoppingLists).values({ userId: user.id, name: 'Compra' }).returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post(`/shopping-lists/${list.id}/items`)
        .set('Authorization', auth(token))
        .send({ productId: product.id })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/shopping-lists/${list.id}/items`)
        .set('Authorization', auth(token))
        .send({ productId: product.id })
        .expect(409);
    });

    it('un producto de otro usuario → 404', async () => {
      const owner = await createUser('propietario-item@example.com');
      const other = await createUser('otro-item@example.com');
      const [otherProduct] = await db.insert(products).values({ userId: other.id, name: 'Leche' }).returning();
      const [list] = await db.insert(shoppingLists).values({ userId: owner.id, name: 'Compra' }).returning();
      const token = await login(owner.email);

      await request(app.getHttpServer())
        .post(`/shopping-lists/${list.id}/items`)
        .set('Authorization', auth(token))
        .send({ productId: otherProduct.id })
        .expect(404);
    });

    it('una lista ajena → 404', async () => {
      const owner = await createUser('propietario-item-lista@example.com');
      const other = await createUser('otro-item-lista@example.com');
      const [product] = await db.insert(products).values({ userId: other.id, name: 'Leche' }).returning();
      const [list] = await db.insert(shoppingLists).values({ userId: owner.id, name: 'Compra' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post(`/shopping-lists/${list.id}/items`)
        .set('Authorization', auth(token))
        .send({ productId: product.id })
        .expect(404);
    });
  });

  describe('DELETE /shopping-lists/:id/items/:itemId', () => {
    it('quita un producto de la lista', async () => {
      const user = await createUser('quitar@example.com');
      const [product] = await db.insert(products).values({ userId: user.id, name: 'Leche' }).returning();
      const [list] = await db.insert(shoppingLists).values({ userId: user.id, name: 'Compra' }).returning();
      const [item] = await db.insert(shoppingListItems).values({ shoppingListId: list.id, productId: product.id }).returning();
      const token = await login(user.email);

      await request(app.getHttpServer())
        .delete(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('Authorization', auth(token))
        .expect(204);

      const remaining = await db.query.shoppingListItems.findFirst({ where: (i, { eq }) => eq(i.id, item.id) });
      expect(remaining).toBeUndefined();
    });

    it('un item de una lista ajena → 404, sin borrarlo', async () => {
      const owner = await createUser('propietario-quitar@example.com');
      const other = await createUser('otro-quitar@example.com');
      const [product] = await db.insert(products).values({ userId: owner.id, name: 'Leche' }).returning();
      const [list] = await db.insert(shoppingLists).values({ userId: owner.id, name: 'Compra' }).returning();
      const [item] = await db.insert(shoppingListItems).values({ shoppingListId: list.id, productId: product.id }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .delete(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('Authorization', auth(token))
        .expect(404);

      const stillThere = await db.query.shoppingListItems.findFirst({ where: (i, { eq }) => eq(i.id, item.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
