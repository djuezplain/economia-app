import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { categories, transactions, users } from '../src/db/schema/index.js';

describe('Categorías (e2e) — spec 002 H3', () => {
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
    await db.delete(transactions);
    await db.delete(categories);
    await db.delete(users);
  });

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /categories', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/categories').expect(401);
    });

    it('con la cuenta sin verificar, responde 403 (cierra H2 criterio 3 de la spec 001)', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);

      await request(app.getHttpServer()).get('/categories').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo las categorías propias, opcionalmente filtradas por tipo', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db
        .insert(categories)
        .values([
          { userId: owner.id, type: 'INCOME', name: 'Nómina' },
          { userId: owner.id, type: 'EXPENSE', name: 'Comida' },
          { userId: other.id, type: 'INCOME', name: 'Categoría ajena' },
        ]);
      const token = await login(owner.email);

      const all = await request(app.getHttpServer()).get('/categories').set('Authorization', auth(token)).expect(200);
      expect(all.body).toHaveLength(2);
      expect(all.body.every((c: { name: string }) => c.name !== 'Categoría ajena')).toBe(true);

      const onlyIncome = await request(app.getHttpServer())
        .get('/categories?type=INCOME')
        .set('Authorization', auth(token))
        .expect(200);
      expect(onlyIncome.body).toHaveLength(1);
      expect(onlyIncome.body[0].name).toBe('Nómina');
    });
  });

  describe('POST /categories', () => {
    it('crea una categoría propia de ingreso o de gasto', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Ocio' })
        .expect(201);

      expect(res.body).toMatchObject({ type: 'EXPENSE', name: 'Ocio', parentId: null, isDefault: false });
    });

    it('crea una subcategoría bajo una categoría de gasto propia (H3 criterio 2)', async () => {
      const user = await createUser('subcategoria@example.com');
      const token = await login(user.email);
      const parent = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Transporte' })
        .expect(201);

      const child = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Gasolina', parentId: parent.body.id })
        .expect(201);

      expect(child.body.parentId).toBe(parent.body.id);
    });

    it('rechaza (400) una subcategoría de ingreso', async () => {
      const user = await createUser('subcategoria-ingreso@example.com');
      const token = await login(user.email);
      const parent = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Transporte' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'INCOME', name: 'Subcategoría inválida', parentId: parent.body.id })
        .expect(400);
    });

    it('rechaza (400) una subcategoría bajo una categoría de ingreso', async () => {
      const user = await createUser('padre-ingreso@example.com');
      const token = await login(user.email);
      const incomeParent = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'INCOME', name: 'Nómina' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Inválida', parentId: incomeParent.body.id })
        .expect(400);
    });

    it('rechaza (400) una subcategoría de una subcategoría (máximo dos niveles)', async () => {
      const user = await createUser('dos-niveles@example.com');
      const token = await login(user.email);
      const parent = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Coche' })
        .expect(201);
      const child = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Gasolina', parentId: parent.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Nieto', parentId: child.body.id })
        .expect(400);
    });

    it('un padre de otro usuario se trata como no encontrado (404), no como prohibido', async () => {
      const owner = await createUser('padre-ajeno-dueno@example.com');
      const attacker = await createUser('padre-ajeno-atacante@example.com');
      const ownerToken = await login(owner.email);
      const attackerToken = await login(attacker.email);
      const ownerCategory = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(ownerToken))
        .send({ type: 'EXPENSE', name: 'Categoría del dueño' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(attackerToken))
        .send({ type: 'EXPENSE', name: 'Subcategoría con padre ajeno', parentId: ownerCategory.body.id })
        .expect(404);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('renombra una categoría propia', async () => {
      const user = await createUser('renombrar@example.com');
      const token = await login(user.email);
      const created = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'INCOME', name: 'Nombre original' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/categories/${created.body.id}`)
        .set('Authorization', auth(token))
        .send({ name: 'Nombre nuevo' })
        .expect(200);

      expect(res.body.name).toBe('Nombre nuevo');
    });

    it('no se puede renombrar una categoría de otro usuario (404)', async () => {
      const owner = await createUser('renombrar-dueno@example.com');
      const attacker = await createUser('renombrar-atacante@example.com');
      const ownerToken = await login(owner.email);
      const attackerToken = await login(attacker.email);
      const created = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(ownerToken))
        .send({ type: 'INCOME', name: 'Categoría del dueño' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/categories/${created.body.id}`)
        .set('Authorization', auth(attackerToken))
        .send({ name: 'Intento de renombrado ajeno' })
        .expect(404);
    });
  });

  describe('DELETE /categories/:id', () => {
    it('borra una categoría propia sin uso', async () => {
      const user = await createUser('borrar@example.com');
      const token = await login(user.email);
      const created = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'INCOME', name: 'A borrar' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/categories/${created.body.id}`)
        .set('Authorization', auth(token))
        .expect(204);
    });

    it('rechaza (409) borrar una categoría con movimientos asociados, sin borrar nada', async () => {
      const user = await createUser('borrar-con-uso@example.com');
      const token = await login(user.email);
      const [category] = await db
        .insert(categories)
        .values({ userId: user.id, type: 'INCOME', name: 'En uso' })
        .returning();
      await db.insert(transactions).values({
        userId: user.id,
        type: 'INCOME',
        date: '2026-08-01',
        categoryId: category.id,
        concept: 'Movimiento de prueba',
        amount: '100.00',
      });

      await request(app.getHttpServer())
        .delete(`/categories/${category.id}`)
        .set('Authorization', auth(token))
        .expect(409);

      const stillThere = await db.query.categories.findFirst({ where: (c, { eq }) => eq(c.id, category.id) });
      expect(stillThere).toBeDefined();
    });

    it('rechaza (409) borrar una categoría con subcategorías propias, sin borrar nada', async () => {
      const user = await createUser('borrar-con-subcategoria@example.com');
      const token = await login(user.email);
      const parent = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Padre' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(token))
        .send({ type: 'EXPENSE', name: 'Hijo', parentId: parent.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/categories/${parent.body.id}`)
        .set('Authorization', auth(token))
        .expect(409);
    });

    it('no se puede borrar una categoría de otro usuario (404)', async () => {
      const owner = await createUser('borrar-dueno@example.com');
      const attacker = await createUser('borrar-atacante@example.com');
      const ownerToken = await login(owner.email);
      const attackerToken = await login(attacker.email);
      const created = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', auth(ownerToken))
        .send({ type: 'INCOME', name: 'Categoría del dueño' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/categories/${created.body.id}`)
        .set('Authorization', auth(attackerToken))
        .expect(404);

      const stillThere = await db.query.categories.findFirst({ where: (c, { eq }) => eq(c.id, created.body.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
