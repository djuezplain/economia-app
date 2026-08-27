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
import { sessions, users } from '../src/db/schema/index.js';
import { SessionsService } from '../src/auth/sessions.service.js';
import { REFRESH_COOKIE_NAME } from '../src/auth/session-cookie.js';

/**
 * Test de contrato de aislamiento (constitution §2 / plan §3, tarea T3.4).
 *
 * No hay todavía ningún endpoint parametrizado por id de recurso ajeno en
 * esta spec (eso llega en el grupo 6, "mis sesiones"), así que el contrato se
 * verifica en las dos superficies que sí existen ya y que manejan una entidad
 * "con dueño": `SessionsService` a nivel de servicio, y el flujo real de
 * logout de dos usuarios a nivel de e2e. Este fichero se referencia desde
 * specs futuras (002+) como la plantilla obligatoria para su propio test de
 * aislamiento (plan.md §3).
 */
describe('Aislamiento de datos entre usuarios — spec 001 (contrato obligatorio)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let sessionsService: SessionsService;

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
    sessionsService = moduleFixture.get<SessionsService>(SessionsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(users);
  });

  async function createActiveUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: 'Usuario aislado', status: 'ACTIVE' })
      .returning();
    return user;
  }

  function extractRefreshCookie(res: request.Response): string {
    const raw = res.headers['set-cookie'] as unknown;
    const cookies = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
    const match = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    if (!match) throw new Error('No se recibió la cookie de refresh token.');
    return match.split(';')[0].split('=')[1];
  }

  it('SessionsService.revokeById nunca revoca la sesión de otro usuario', async () => {
    const userA = await createActiveUser('aislamiento-a@example.com');
    const userB = await createActiveUser('aislamiento-b@example.com');

    const [sessionB] = await db
      .insert(sessions)
      .values({
        userId: userB.id,
        refreshTokenHash: 'hash-de-prueba-sesion-b',
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();

    // A intenta revocar, por id, una sesión que pertenece a B.
    const revoked = await sessionsService.revokeById(sessionB.id, userA.id);
    expect(revoked).toBe(false);

    const [stillActive] = await db.select().from(sessions).where(eq(sessions.id, sessionB.id));
    expect(stillActive.revokedAt).toBeNull();
  });

  it('el logout de un usuario nunca afecta a las sesiones de otro', async () => {
    const userA = await createActiveUser('logout-aislado-a@example.com');
    const userB = await createActiveUser('logout-aislado-b@example.com');

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userA.email, password: PASSWORD })
      .expect(200);
    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userB.email, password: PASSWORD })
      .expect(200);

    const cookieA = extractRefreshCookie(loginA);
    const accessTokenA = loginA.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookieA}`)
      .expect(200);

    const [sessionA] = await db.select().from(sessions).where(eq(sessions.userId, userA.id));
    expect(sessionA.revokedAt).not.toBeNull();

    // La sesión de B, creada en el mismo lote de peticiones, sigue intacta.
    const [sessionB] = await db.select().from(sessions).where(eq(sessions.userId, userB.id));
    expect(sessionB.revokedAt).toBeNull();

    const cookieB = extractRefreshCookie(loginB);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookieB}`)
      .expect(200);
  });

  it('revokeByRefreshToken no revoca la sesión si el token pertenece a otro usuario', async () => {
    const userA = await createActiveUser('robo-cruzado-a@example.com');
    const userB = await createActiveUser('robo-cruzado-b@example.com');

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userB.email, password: PASSWORD })
      .expect(200);
    const refreshTokenB = extractRefreshCookie(loginB);

    // A intenta revocar, con SU userId, el refresh token real de B.
    await sessionsService.revokeByRefreshToken(refreshTokenB, userA.id);

    const [sessionB] = await db.select().from(sessions).where(eq(sessions.userId, userB.id));
    expect(sessionB.revokedAt).toBeNull();

    // El token de B sigue funcionando con normalidad.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshTokenB}`)
      .expect(200);
  });
});
