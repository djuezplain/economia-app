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

describe('Historial de valoraciones de vehículos (e2e) — spec 023 H2', () => {
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

  async function createUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    return user;
  }

  async function createVehicle(userId: string, brandModel: string, plate: string) {
    const [vehicle] = await db
      .insert(vehicles)
      .values({ userId, brandModel, plate, purchasePrice: '20000.00', purchaseDate: '2026-01-01' })
      .returning();
    return vehicle;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  describe('GET /vehicle-valuations', () => {
    it('sin autenticar, responde 401', async () => {
      await request(app.getHttpServer()).get('/vehicle-valuations').expect(401);
    });

    it('lista solo las valoraciones de vehículos propios, ordenadas de la más reciente a la más antigua', async () => {
      const owner = await createUser('propietario@example.com');
      const other = await createUser('otro@example.com');
      const ownerVehicle = await createVehicle(owner.id, 'Toyota Corolla', '1234ABC');
      const otherVehicle = await createVehicle(other.id, 'Seat Ibiza', '9999ZZZ');
      await db.insert(vehicleValuations).values([
        { vehicleId: ownerVehicle.id, value: '18000.00', date: '2026-06-01' },
        { vehicleId: ownerVehicle.id, value: '17000.00', date: '2026-09-01' },
        { vehicleId: otherVehicle.id, value: '9000.00', date: '2026-09-01' },
      ]);
      const token = await login(owner.email);

      const res = await request(app.getHttpServer()).get('/vehicle-valuations').set('Authorization', auth(token)).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-09-01');
      expect(res.body[1].date).toBe('2026-06-01');
      expect(res.body.every((v: { vehicleId: string }) => v.vehicleId === ownerVehicle.id)).toBe(true);
    });
  });

  describe('POST /vehicle-valuations', () => {
    it('crea una valoración en un vehículo propio', async () => {
      const user = await createUser('crear@example.com');
      const vehicle = await createVehicle(user.id, 'Toyota Corolla', '1234ABC');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .post('/vehicle-valuations')
        .set('Authorization', auth(token))
        .send({ vehicleId: vehicle.id, value: '18000.00', date: '2026-06-01' })
        .expect(201);

      expect(res.body.vehicleId).toBe(vehicle.id);
      expect(res.body.value).toBe('18000.00');
      expect(res.body.date).toBe('2026-06-01');
    });

    it('H2 criterio 3: admite varias valoraciones en el mismo vehículo, en fechas distintas', async () => {
      const user = await createUser('varias-valoraciones@example.com');
      const vehicle = await createVehicle(user.id, 'Toyota Corolla', '1234ABC');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/vehicle-valuations')
        .set('Authorization', auth(token))
        .send({ vehicleId: vehicle.id, value: '18000.00', date: '2026-06-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/vehicle-valuations')
        .set('Authorization', auth(token))
        .send({ vehicleId: vehicle.id, value: '17000.00', date: '2026-09-01' })
        .expect(201);

      const valuations = await db.query.vehicleValuations.findMany({ where: (v, { eq }) => eq(v.vehicleId, vehicle.id) });
      expect(valuations).toHaveLength(2);
    });

    it('H2 criterio 2: valor negativo → 400 (a diferencia del saldo de una cuenta bancaria)', async () => {
      const user = await createUser('valor-negativo@example.com');
      const vehicle = await createVehicle(user.id, 'Toyota Corolla', '1234ABC');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .post('/vehicle-valuations')
        .set('Authorization', auth(token))
        .send({ vehicleId: vehicle.id, value: '-18000.00', date: '2026-06-01' })
        .expect(400);
    });

    it('H2 criterio 6: crear una valoración sobre un vehículo ajeno → 404', async () => {
      const owner = await createUser('propietario-ajena@example.com');
      const other = await createUser('otro-ajena@example.com');
      const ownerVehicle = await createVehicle(owner.id, 'Toyota Corolla', '1234ABC');
      const token = await login(other.email);

      await request(app.getHttpServer())
        .post('/vehicle-valuations')
        .set('Authorization', auth(token))
        .send({ vehicleId: ownerVehicle.id, value: '18000.00', date: '2026-06-01' })
        .expect(404);
    });

    it('valor no numérico → 400', async () => {
      const user = await createUser('valor-invalido@example.com');
      const vehicle = await createVehicle(user.id, 'Toyota Corolla', '1234ABC');
      const token = await login(user.email);
      await request(app.getHttpServer())
        .post('/vehicle-valuations')
        .set('Authorization', auth(token))
        .send({ vehicleId: vehicle.id, value: 'abc', date: '2026-06-01' })
        .expect(400);
    });
  });

  describe('PATCH /vehicle-valuations/:id', () => {
    it('edita valor y fecha', async () => {
      const user = await createUser('editar@example.com');
      const vehicle = await createVehicle(user.id, 'Toyota Corolla', '1234ABC');
      const token = await login(user.email);
      const [valuation] = await db.insert(vehicleValuations).values({ vehicleId: vehicle.id, value: '18000.00', date: '2026-06-01' }).returning();

      const res = await request(app.getHttpServer())
        .patch(`/vehicle-valuations/${valuation.id}`)
        .set('Authorization', auth(token))
        .send({ value: '17000.00', date: '2026-09-01' })
        .expect(200);

      expect(res.body.value).toBe('17000.00');
      expect(res.body.date).toBe('2026-09-01');
    });

    it('una valoración de un vehículo ajeno → 404', async () => {
      const owner = await createUser('propietario-edit@example.com');
      const other = await createUser('otro-edit@example.com');
      const vehicle = await createVehicle(owner.id, 'Toyota Corolla', '1234ABC');
      const [valuation] = await db.insert(vehicleValuations).values({ vehicleId: vehicle.id, value: '18000.00', date: '2026-06-01' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer())
        .patch(`/vehicle-valuations/${valuation.id}`)
        .set('Authorization', auth(token))
        .send({ value: '99999.00' })
        .expect(404);
    });
  });

  describe('DELETE /vehicle-valuations/:id', () => {
    it('elimina una valoración, sin afectar al vehículo ni a las demás valoraciones', async () => {
      const user = await createUser('eliminar@example.com');
      const vehicle = await createVehicle(user.id, 'Toyota Corolla', '1234ABC');
      const token = await login(user.email);
      const [valuationA] = await db
        .insert(vehicleValuations)
        .values({ vehicleId: vehicle.id, value: '18000.00', date: '2026-06-01' })
        .returning();
      await db.insert(vehicleValuations).values({ vehicleId: vehicle.id, value: '17000.00', date: '2026-09-01' });

      await request(app.getHttpServer()).delete(`/vehicle-valuations/${valuationA.id}`).set('Authorization', auth(token)).expect(204);

      const remainingValuations = await db.query.vehicleValuations.findMany({ where: (v, { eq }) => eq(v.vehicleId, vehicle.id) });
      expect(remainingValuations).toHaveLength(1);
      const stillThereVehicle = await db.query.vehicles.findFirst({ where: (v, { eq }) => eq(v.id, vehicle.id) });
      expect(stillThereVehicle).toBeDefined();
    });

    it('una valoración de un vehículo ajeno → 404, sin borrarla', async () => {
      const owner = await createUser('propietario-del@example.com');
      const other = await createUser('otro-del@example.com');
      const vehicle = await createVehicle(owner.id, 'Toyota Corolla', '1234ABC');
      const [valuation] = await db.insert(vehicleValuations).values({ vehicleId: vehicle.id, value: '18000.00', date: '2026-06-01' }).returning();
      const token = await login(other.email);

      await request(app.getHttpServer()).delete(`/vehicle-valuations/${valuation.id}`).set('Authorization', auth(token)).expect(404);

      const stillThere = await db.query.vehicleValuations.findFirst({ where: (v, { eq }) => eq(v.id, valuation.id) });
      expect(stillThere).toBeDefined();
    });
  });
});
