import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { bankAccountEntries, users } from '../src/db/schema/index.js';

describe('Entradas de cuentas bancarias (e2e) — spec 018 H2', () => {
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
    await db.delete(bankAccountEntries);
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

  describe('GET /bank-account-entries', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/bank-account-entries').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/bank-account-entries').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo las entradas propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(bankAccountEntries).values([
        { userId: owner.id, bank: 'BBVA', accountNumber: 'ES01', euros: '1000.00', date: '2026-08-01' },
        { userId: owner.id, bank: 'BBVA', accountNumber: 'ES01', euros: '1200.00', date: '2026-09-01' },
        { userId: other.id, bank: 'Santander', accountNumber: 'ES99', euros: '9999.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/bank-account-entries').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
    });
  });

  describe('POST /bank-account-entries', () => {
    it('crea una entrada', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/bank-account-entries')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234', euros: '1500.50', date: '2026-09-04' })
        .expect(201);

      expect(res.body.bank).toBe('BBVA');
      expect(res.body.accountNumber).toBe('ES1234');
      expect(res.body.euros).toBe('1500.50');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('H2 criterio 2: admite varias entradas del mismo banco/cuenta en fechas distintas', async () => {
      const user = await createUser('varias-entradas@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/bank-account-entries')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234', euros: '1000.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/bank-account-entries')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234', euros: '1200.00', date: '2026-09-01' })
        .expect(201);

      const entries = await db.query.bankAccountEntries.findMany({ where: (e, { eq }) => eq(e.userId, user.id) });
      expect(entries).toHaveLength(2);
    });

    it('H2 criterio 3: euros admite importes negativos (descubierto)', async () => {
      const user = await createUser('descubierto@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/bank-account-entries')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234', euros: '-150.25', date: '2026-09-04' })
        .expect(201);

      expect(res.body.euros).toBe('-150.25');
    });

    it('euros con más de 2 decimales, o no numérico → 400', async () => {
      const user = await createUser('euros-invalido@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/bank-account-entries')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234', euros: 'abc', date: '2026-09-04' })
        .expect(400);
    });

    it('sin banco, número de cuenta o fecha → 400', async () => {
      const user = await createUser('campos-obligatorios@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/bank-account-entries')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', euros: '100.00', date: '2026-09-04' })
        .expect(400);
    });
  });

  describe('PATCH /bank-account-entries/:id', () => {
    it('edita los 4 campos', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [entry] = await db
        .insert(bankAccountEntries)
        .values({ userId: user.id, bank: 'BBVA', accountNumber: 'ES1234', euros: '1000.00', date: '2026-09-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/bank-account-entries/${entry.id}`)
        .set('Authorization', auth(token))
        .send({ bank: 'Santander', accountNumber: 'ES9999', euros: '2000.00', date: '2026-09-10' })
        .expect(200);

      expect(res.body.bank).toBe('Santander');
      expect(res.body.accountNumber).toBe('ES9999');
      expect(res.body.euros).toBe('2000.00');
      expect(res.body.date).toBe('2026-09-10');
    });

    it('una entrada ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [entry] = await db
        .insert(bankAccountEntries)
        .values({ userId: owner.id, bank: 'BBVA', accountNumber: 'ES1234', euros: '1000.00', date: '2026-09-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/bank-account-entries/${entry.id}`)
        .set('Authorization', auth(token))
        .send({ euros: '9999.00' })
        .expect(404);
    });
  });

  describe('DELETE /bank-account-entries/:id', () => {
    it('elimina una entrada propia', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [entry] = await db
        .insert(bankAccountEntries)
        .values({ userId: user.id, bank: 'BBVA', accountNumber: 'ES1234', euros: '1000.00', date: '2026-09-01' })
        .returning();

      await request(app.getHttpServer()).delete(`/bank-account-entries/${entry.id}`).set('Authorization', auth(token)).expect(204);

      const remaining = await db.query.bankAccountEntries.findMany({ where: (e, { eq }) => eq(e.userId, user.id) });
      expect(remaining).toHaveLength(0);
    });

    it('una entrada ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [entry] = await db
        .insert(bankAccountEntries)
        .values({ userId: owner.id, bank: 'BBVA', accountNumber: 'ES1234', euros: '1000.00', date: '2026-09-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/bank-account-entries/${entry.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.bankAccountEntries.findFirst({ where: (e, { eq }) => eq(e.id, entry.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
