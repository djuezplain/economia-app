import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { bankAccountBalances, bankAccounts, users } from '../src/db/schema/index.js';

describe('Cuentas bancarias (e2e) — spec 019 H1', () => {
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
    await db.delete(bankAccountBalances);
    await db.delete(bankAccounts);
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

  describe('GET /bank-accounts', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/bank-accounts').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/bank-accounts').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo las cuentas propias', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(bankAccounts).values([
        { userId: owner.id, bank: 'BBVA', accountNumber: 'ES1234' },
        { userId: other.id, bank: 'Santander', accountNumber: 'ES9999' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/bank-accounts').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].bank).toBe('BBVA');
    });
  });

  describe('POST /bank-accounts', () => {
    it('crea una cuenta', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/bank-accounts')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234' })
        .expect(201);

      expect(res.body.bank).toBe('BBVA');
      expect(res.body.accountNumber).toBe('ES1234');
    });

    it('H1 criterio 2: la misma cuenta (banco + número) dos veces → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/bank-accounts')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bank-accounts')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234' })
        .expect(409);
    });

    it('mismo banco+número pero de otro usuario no choca (aislamiento)', async () => {
      const userA = await createUser('usuario-a@example.com');
      const userB = await createUser('usuario-b@example.com');
      const tokenA = await login(userA.email);
      const tokenB = await login(userB.email);

      await request(app.getHttpServer())
        .post('/bank-accounts')
        .set('Authorization', auth(tokenA))
        .send({ bank: 'BBVA', accountNumber: 'ES1234' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/bank-accounts')
        .set('Authorization', auth(tokenB))
        .send({ bank: 'BBVA', accountNumber: 'ES1234' })
        .expect(201);
    });

    it('sin banco o sin número de cuenta → 400', async () => {
      const user = await createUser('campos-obligatorios@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/bank-accounts')
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA' })
        .expect(400);
    });
  });

  describe('PATCH /bank-accounts/:id', () => {
    it('edita banco y número de cuenta', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [account] = await db.insert(bankAccounts).values({ userId: user.id, bank: 'BBVA', accountNumber: 'ES1234' }).returning();

      const res = await request(app.getHttpServer())
        .patch(`/bank-accounts/${account.id}`)
        .set('Authorization', auth(token))
        .send({ bank: 'Santander', accountNumber: 'ES9999' })
        .expect(200);

      expect(res.body.bank).toBe('Santander');
      expect(res.body.accountNumber).toBe('ES9999');
    });

    it('editar hacia un duplicado de otra cuenta propia → 409', async () => {
      const user = await createUser('editar-duplicado@example.com');
      const token = await login(user.email);
      await db.insert(bankAccounts).values({ userId: user.id, bank: 'Santander', accountNumber: 'ES9999' });
      const [account] = await db.insert(bankAccounts).values({ userId: user.id, bank: 'BBVA', accountNumber: 'ES1234' }).returning();

      await request(app.getHttpServer())
        .patch(`/bank-accounts/${account.id}`)
        .set('Authorization', auth(token))
        .send({ bank: 'Santander', accountNumber: 'ES9999' })
        .expect(409);
    });

    it('editar sin cambiar banco/número no choca consigo misma', async () => {
      const user = await createUser('editar-sin-cambios@example.com');
      const token = await login(user.email);
      const [account] = await db.insert(bankAccounts).values({ userId: user.id, bank: 'BBVA', accountNumber: 'ES1234' }).returning();

      await request(app.getHttpServer())
        .patch(`/bank-accounts/${account.id}`)
        .set('Authorization', auth(token))
        .send({ bank: 'BBVA', accountNumber: 'ES1234' })
        .expect(200);
    });

    it('una cuenta ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [account] = await db.insert(bankAccounts).values({ userId: owner.id, bank: 'BBVA', accountNumber: 'ES1234' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/bank-accounts/${account.id}`)
        .set('Authorization', auth(token))
        .send({ bank: 'Otro' })
        .expect(404);
    });
  });

  describe('DELETE /bank-accounts/:id', () => {
    it('H1 criterio 4: elimina la cuenta y, en cascada, todo su historial de saldos', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [account] = await db.insert(bankAccounts).values({ userId: user.id, bank: 'BBVA', accountNumber: 'ES1234' }).returning();
      await db.insert(bankAccountBalances).values([
        { bankAccountId: account.id, euros: '1000.00', date: '2026-08-01' },
        { bankAccountId: account.id, euros: '1200.00', date: '2026-09-01' },
      ]);

      await request(app.getHttpServer()).delete(`/bank-accounts/${account.id}`).set('Authorization', auth(token)).expect(204);

      const remainingAccounts = await db.query.bankAccounts.findMany({ where: (a, { eq }) => eq(a.userId, user.id) });
      expect(remainingAccounts).toHaveLength(0);
      const remainingBalances = await db.query.bankAccountBalances.findMany({
        where: (b, { eq }) => eq(b.bankAccountId, account.id),
      });
      expect(remainingBalances).toHaveLength(0);
    });

    it('una cuenta ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [account] = await db.insert(bankAccounts).values({ userId: owner.id, bank: 'BBVA', accountNumber: 'ES1234' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/bank-accounts/${account.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.bankAccounts.findFirst({ where: (a, { eq }) => eq(a.id, account.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
