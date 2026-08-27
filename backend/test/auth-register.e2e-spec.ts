import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { emailTokens, users } from '../src/db/schema/index.js';

describe('POST /auth/register (e2e) — spec 001 H1', () => {
  let app: INestApplication<App>;
  let db: Database;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Replicar aquí la configuración real de main.ts (ValidationPipe global)
    // para que el test cubra el mismo comportamiento que producción.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    db = moduleFixture.get<Database>(DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Aislar cada test: la BD de test empieza vacía en cada caso.
    await db.delete(emailTokens);
    await db.delete(users);
  });

  it('crea la cuenta en PENDING_VERIFICATION y genera un token de verificación', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'ana@example.com', password: 'unaClaveSegura123', name: 'Ana' })
      .expect(200);

    expect(res.body).toEqual({ message: expect.any(String) });

    const [user] = await db.select().from(users).where(eq(users.email, 'ana@example.com'));
    expect(user).toBeDefined();
    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(user.passwordHash).not.toBe('unaClaveSegura123'); // nunca en claro

    const tokens = await db.select().from(emailTokens).where(eq(emailTokens.userId, user.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('VERIFY_EMAIL');
  });

  it('con un email ya registrado responde igual (mismo status y mensaje) y no duplica el usuario', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'ana@example.com', password: 'unaClaveSegura123', name: 'Ana' })
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'ana@example.com', password: 'otraClaveValida456', name: 'Ana' })
      .expect(200);

    expect(second.body).toEqual({ message: expect.any(String) });

    const rows = await db.select().from(users).where(eq(users.email, 'ana@example.com'));
    expect(rows).toHaveLength(1); // no se ha creado un segundo usuario
  });

  it('rechaza una contraseña que no cumple la política mínima, aunque no se valide en el cliente', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'debil@example.com', password: '123', name: 'Débil' })
      .expect(400);

    expect(res.body.message[0]).toContain('contraseña');

    const rows = await db.select().from(users).where(eq(users.email, 'debil@example.com'));
    expect(rows).toHaveLength(0);
  });

  it('rechaza un email con formato inválido', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'no-es-un-email', password: 'unaClaveSegura123', name: 'X' })
      .expect(400);
  });
});
