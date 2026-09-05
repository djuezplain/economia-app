import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { users, vehicles, vehicleValuations } from '../src/db/schema/index.js';

describe('Vehículos (e2e) — spec 023 H1', () => {
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
    await db.delete(vehicleValuations);
    await db.delete(vehicles);
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

  describe('GET /vehicles', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/vehicles').expect(401);
    });

    it('con la cuenta sin verificar, responde 403', async () => {
      const user = await createUser('sin-verificar@example.com', 'PENDING_VERIFICATION');
      const token = await login(user.email);
      await request(app.getHttpServer()).get('/vehicles').set('Authorization', auth(token)).expect(403);
    });

    it('lista solo los vehículos propios', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      await db.insert(vehicles).values([
        { userId: owner.id, brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' },
        { userId: other.id, brandModel: 'Seat Ibiza', plate: '9999ZZZ', purchasePrice: '12000.00', purchaseDate: '2026-01-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/vehicles').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].brandModel).toBe('Toyota Corolla');
    });
  });

  describe('POST /vehicles', () => {
    it('crea un vehículo', async () => {
      const user = await createUser('crear@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', auth(token))
        .send({ brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .expect(201);

      expect(res.body.brandModel).toBe('Toyota Corolla');
      expect(res.body.plate).toBe('1234ABC');
      expect(res.body.purchasePrice).toBe('20000.00');
      expect(res.body.purchaseDate).toBe('2026-01-01');
    });

    it('H1 criterio 2: el mismo vehículo (marca/modelo + matrícula) dos veces → 409', async () => {
      const user = await createUser('duplicado@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', auth(token))
        .send({ brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', auth(token))
        .send({ brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '18000.00', purchaseDate: '2026-02-01' })
        .expect(409);
    });

    it('mismo vehículo pero de otro usuario no choca (aislamiento)', async () => {
      const userA = await createUser('usuario-a@example.com');
      const userB = await createUser('usuario-b@example.com');
      const tokenA = await login(userA.email);
      const tokenB = await login(userB.email);

      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', auth(tokenA))
        .send({ brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', auth(tokenB))
        .send({ brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .expect(201);
    });

    it('sin marca/modelo, sin matrícula, sin precio o sin fecha de compra → 400', async () => {
      const user = await createUser('campos-obligatorios@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', auth(token))
        .send({ brandModel: 'Toyota Corolla', plate: '1234ABC' })
        .expect(400);
    });

    it('precio de compra negativo → 400', async () => {
      const user = await createUser('precio-invalido@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', auth(token))
        .send({ brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '-20000.00', purchaseDate: '2026-01-01' })
        .expect(400);
    });
  });

  describe('PATCH /vehicles/:id', () => {
    it('edita marca/modelo, matrícula, precio y fecha de compra', async () => {
      const user = await createUser('editar@example.com');
      const token = await login(user.email);
      const [vehicle] = await db
        .insert(vehicles)
        .values({ userId: user.id, brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .returning();

      const res = await request(app.getHttpServer())
        .patch(`/vehicles/${vehicle.id}`)
        .set('Authorization', auth(token))
        .send({ plate: '5678XYZ', purchasePrice: '19000.00' })
        .expect(200);

      expect(res.body.plate).toBe('5678XYZ');
      expect(res.body.purchasePrice).toBe('19000.00');
      expect(res.body.brandModel).toBe('Toyota Corolla');
    });

    it('editar hacia un duplicado de otro vehículo propio → 409', async () => {
      const user = await createUser('editar-duplicado@example.com');
      const token = await login(user.email);
      await db
        .insert(vehicles)
        .values({ userId: user.id, brandModel: 'Seat Ibiza', plate: '9999ZZZ', purchasePrice: '12000.00', purchaseDate: '2026-01-01' });
      const [vehicle] = await db
        .insert(vehicles)
        .values({ userId: user.id, brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .returning();

      await request(app.getHttpServer())
        .patch(`/vehicles/${vehicle.id}`)
        .set('Authorization', auth(token))
        .send({ brandModel: 'Seat Ibiza', plate: '9999ZZZ' })
        .expect(409);
    });

    it('editar sin cambiar marca/modelo ni matrícula no choca consigo mismo', async () => {
      const user = await createUser('editar-sin-cambios@example.com');
      const token = await login(user.email);
      const [vehicle] = await db
        .insert(vehicles)
        .values({ userId: user.id, brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .returning();

      await request(app.getHttpServer())
        .patch(`/vehicles/${vehicle.id}`)
        .set('Authorization', auth(token))
        .send({ brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '19000.00' })
        .expect(200);
    });

    it('un vehículo ajeno → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const [vehicle] = await db
        .insert(vehicles)
        .values({ userId: owner.id, brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/vehicles/${vehicle.id}`)
        .set('Authorization', auth(token))
        .send({ plate: '0000AAA' })
        .expect(404);
    });
  });

  describe('DELETE /vehicles/:id', () => {
    it('H1 criterio 4: elimina el vehículo y, en cascada, todo su historial de valoraciones', async () => {
      const user = await createUser('eliminar@example.com');
      const token = await login(user.email);
      const [vehicle] = await db
        .insert(vehicles)
        .values({ userId: user.id, brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .returning();
      await db.insert(vehicleValuations).values([
        { vehicleId: vehicle.id, value: '18000.00', date: '2026-06-01' },
        { vehicleId: vehicle.id, value: '17000.00', date: '2026-09-01' },
      ]);

      await request(app.getHttpServer()).delete(`/vehicles/${vehicle.id}`).set('Authorization', auth(token)).expect(204);

      const remainingVehicles = await db.query.vehicles.findMany({ where: (v, { eq }) => eq(v.userId, user.id) });
      expect(remainingVehicles).toHaveLength(0);
      const remainingValuations = await db.query.vehicleValuations.findMany({
        where: (v, { eq }) => eq(v.vehicleId, vehicle.id),
      });
      expect(remainingValuations).toHaveLength(0);
    });

    it('un vehículo ajeno → 404, sin borrarlo', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const [vehicle] = await db
        .insert(vehicles)
        .values({ userId: owner.id, brandModel: 'Toyota Corolla', plate: '1234ABC', purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
        .returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/vehicles/${vehicle.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.vehicles.findFirst({ where: (v, { eq }) => eq(v.id, vehicle.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
