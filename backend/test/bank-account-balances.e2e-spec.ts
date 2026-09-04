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

describe('Historial de saldos de cuentas bancarias (e2e) — spec 019 H2', () => {
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

  async function createAccount(userId: string, bank: string, accountNumber: string) {
    const [account] = await db.insert(bankAccounts).values({ userId, bank, accountNumber }).returning();
    return account;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /bank-account-balances', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/bank-account-balances').expect(401);
    });

    it('lista solo las entradas de cuentas propias, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerAccount = await createAccount(owner.id, 'BBVA', 'ES1234');
      const otherAccount = await createAccount(other.id, 'Santander', 'ES9999');
      await db.insert(bankAccountBalances).values([
        { bankAccountId: ownerAccount.id, euros: '1000.00', date: '2026-08-01' },
        { bankAccountId: ownerAccount.id, euros: '1200.00', date: '2026-09-01' },
        { bankAccountId: otherAccount.id, euros: '9999.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/bank-account-balances').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-08-01');
      expect(res.body.every((b: { bankAccountId: string }) => b.bankAccountId === ownerAccount.id)).toBe(true);
    });
  });

  describe('POST /bank-account-balances', () => {
    it('crea una entrada de saldo en una cuenta propia', async () => {
      const user = await createUser('crear@example.com');
      const account = await createAccount(user.id, 'BBVA', 'ES1234');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/bank-account-balances')
        .set('Authorization', auth(token))
        .send({ bankAccountId: account.id, euros: '1500.50', date: '2026-09-04' })
        .expect(201);

      expect(res.body.bankAccountId).toBe(account.id);
      expect(res.body.euros).toBe('1500.50');
      expect(res.body.date).toBe('2026-09-04');
    });

    it('H2 criterio 2: admite varias entradas en la misma cuenta, en fechas distintas', async () => {
      const user = await createUser('varias-entradas@example.com');
      const account = await createAccount(user.id, 'BBVA', 'ES1234');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/bank-account-balances')
        .set('Authorization', auth(token))
        .send({ bankAccountId: account.id, euros: '1000.00', date: '2026-08-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/bank-account-balances')
        .set('Authorization', auth(token))
        .send({ bankAccountId: account.id, euros: '1200.00', date: '2026-09-01' })
        .expect(201);

      const balances = await db.query.bankAccountBalances.findMany({ where: (b, { eq }) => eq(b.bankAccountId, account.id) });
      expect(balances).toHaveLength(2);
    });

    it('H2 criterio 3: euros admite importes negativos (descubierto)', async () => {
      const user = await createUser('descubierto@example.com');
      const account = await createAccount(user.id, 'BBVA', 'ES1234');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/bank-account-balances')
        .set('Authorization', auth(token))
        .send({ bankAccountId: account.id, euros: '-150.25', date: '2026-09-04' })
        .expect(201);

      expect(res.body.euros).toBe('-150.25');
    });

    it('H2 criterio 6: crear una entrada sobre una cuenta ajena → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerAccount = await createAccount(owner.id, 'BBVA', 'ES1234');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/bank-account-balances')
        .set('Authorization', auth(token))
        .send({ bankAccountId: ownerAccount.id, euros: '999.00', date: '2026-09-04' })
        .expect(404);
    });

    it('euros no numérico → 400', async () => {
      const user = await createUser('euros-invalido@example.com');
      const account = await createAccount(user.id, 'BBVA', 'ES1234');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/bank-account-balances')
        .set('Authorization', auth(token))
        .send({ bankAccountId: account.id, euros: 'abc', date: '2026-09-04' })
        .expect(400);
    });
  });

  describe('PATCH /bank-account-balances/:id', () => {
    it('edita euros y fecha', async () => {
      const user = await createUser('editar@example.com');
      const account = await createAccount(user.id, 'BBVA', 'ES1234');
      const token = await login(user.email);
      const [balance] = await db.insert(bankAccountBalances).values({ bankAccountId: account.id, euros: '1000.00', date: '2026-09-01' }).returning();

      const res = await request(app.getHttpServer())
        .patch(`/bank-account-balances/${balance.id}`)
        .set('Authorization', auth(token))
        .send({ euros: '2000.00', date: '2026-09-10' })
        .expect(200);

      expect(res.body.euros).toBe('2000.00');
      expect(res.body.date).toBe('2026-09-10');
    });

    it('una entrada de una cuenta ajena → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const account = await createAccount(owner.id, 'BBVA', 'ES1234');
      const [balance] = await db.insert(bankAccountBalances).values({ bankAccountId: account.id, euros: '1000.00', date: '2026-09-01' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/bank-account-balances/${balance.id}`)
        .set('Authorization', auth(token))
        .send({ euros: '9999.00' })
        .expect(404);
    });
  });

  describe('DELETE /bank-account-balances/:id', () => {
    it('elimina una entrada, sin afectar a la cuenta ni a las demás entradas', async () => {
      const user = await createUser('eliminar@example.com');
      const account = await createAccount(user.id, 'BBVA', 'ES1234');
      const token = await login(user.email);
      const [balanceA] = await db.insert(bankAccountBalances).values({ bankAccountId: account.id, euros: '1000.00', date: '2026-08-01' }).returning();
      await db.insert(bankAccountBalances).values({ bankAccountId: account.id, euros: '1200.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/bank-account-balances/${balanceA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingBalances = await db.query.bankAccountBalances.findMany({ where: (b, { eq }) => eq(b.bankAccountId, account.id) });
      expect(remainingBalances).toHaveLength(1);
      const stillThereAccount = await db.query.bankAccounts.findFirst({ where: (a, { eq }) => eq(a.id, account.id) });
      expect(stillThereAccount).toBeDefined();
    });

    it('una entrada de una cuenta ajena → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const account = await createAccount(owner.id, 'BBVA', 'ES1234');
      const [balance] = await db.insert(bankAccountBalances).values({ bankAccountId: account.id, euros: '1000.00', date: '2026-09-01' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/bank-account-balances/${balance.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.bankAccountBalances.findFirst({ where: (b, { eq }) => eq(b.id, balance.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
