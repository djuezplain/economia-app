import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { categories, googleSheetsImportConfigs, transactions, users } from '../src/db/schema/index.js';
import { GoogleSheetAccessError, GoogleSheetsService } from '../src/import/google-sheets.service.js';
import type { ParsedWorkbook } from '../src/import/import.parsing.js';

/** Doble de test de `GoogleSheetsService` (spec 026): nunca llama a la API real de Google. */
class FakeGoogleSheetsService {
  configured = true;
  email = 'import@economia-app.iam.gserviceaccount.com';
  fetchImpl: (spreadsheetId: string) => Promise<ParsedWorkbook> = async () => ({ incomeRows: [], expenseRows: [] });

  isConfigured(): boolean {
    return this.configured;
  }

  serviceAccountEmail(): string {
    return this.email;
  }

  extractSpreadsheetId(input: string): string | null {
    const trimmed = input.trim();
    return trimmed === '' ? null : trimmed;
  }

  fetchWorkbook(spreadsheetId: string): Promise<ParsedWorkbook> {
    return this.fetchImpl(spreadsheetId);
  }
}

function workbookWithOneIncomeRow(concepto: string): ParsedWorkbook {
  return {
    incomeRows: [{ rowNumber: 2, fecha: '2026-01-15', tipo: 'Nómina', concepto, valor: '2000' }],
    expenseRows: [],
  };
}

describe('Importación desde Google Sheets (e2e) — spec 026', () => {
  let app: INestApplication<App>;
  let db: Database;
  let fakeGoogleSheets: FakeGoogleSheetsService;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    fakeGoogleSheets = new FakeGoogleSheetsService();

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleSheetsService)
      .useValue(fakeGoogleSheets)
      .compile();

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
    await db.delete(googleSheetsImportConfigs);
    await db.delete(users);
    fakeGoogleSheets.configured = true;
    fakeGoogleSheets.fetchImpl = async () => ({ incomeRows: [], expenseRows: [] });
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

  it('sin autenticar, responde 401', async () => {
    await request(app.getHttpServer()).get('/import/google-sheet/config').expect(401);
  });

  it('sin credenciales de la cuenta de servicio configuradas, responde 503', async () => {
    const user = await createUser('sin-configurar@example.com');
    const token = await login(user.email);
    fakeGoogleSheets.configured = false;

    await request(app.getHttpServer()).get('/import/google-sheet/config').set('Authorization', auth(token)).expect(503);
  });

  it('GET /config sin hoja guardada devuelve el email de la cuenta de servicio y el resto vacío', async () => {
    const user = await createUser('sin-hoja@example.com');
    const token = await login(user.email);

    const res = await request(app.getHttpServer()).get('/import/google-sheet/config').set('Authorization', auth(token)).expect(200);
    expect(res.body).toEqual({ serviceAccountEmail: fakeGoogleSheets.email, spreadsheetId: null, autoImportEnabled: false, lastRun: null });
  });

  it('PUT /config con una hoja inaccesible responde 400 y no guarda nada', async () => {
    const user = await createUser('inaccesible@example.com');
    const token = await login(user.email);
    fakeGoogleSheets.fetchImpl = async () => {
      throw new GoogleSheetAccessError('No se puede acceder a esta Google Sheet.');
    };

    const res = await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(token))
      .send({ spreadsheetId: 'hoja-sin-permiso' })
      .expect(400);
    expect(res.body.message).toMatch(/No se puede acceder/);

    const stored = await db.query.googleSheetsImportConfigs.findFirst({ where: eq(googleSheetsImportConfigs.userId, user.id) });
    expect(stored).toBeUndefined();
  });

  it('PUT /config con una hoja accesible la guarda', async () => {
    const user = await createUser('config-valida@example.com');
    const token = await login(user.email);

    const res = await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(token))
      .send({ spreadsheetId: 'hoja-valida-123' })
      .expect(200);
    expect(res.body).toMatchObject({ spreadsheetId: 'hoja-valida-123', autoImportEnabled: false });
  });

  it('PATCH /config/auto-import sin hoja configurada responde 400', async () => {
    const user = await createUser('sin-hoja-auto@example.com');
    const token = await login(user.email);

    await request(app.getHttpServer())
      .patch('/import/google-sheet/config/auto-import')
      .set('Authorization', auth(token))
      .send({ enabled: true })
      .expect(400);
  });

  it('PATCH /config/auto-import activa y desactiva con una hoja ya configurada', async () => {
    const user = await createUser('auto-import@example.com');
    const token = await login(user.email);
    await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(token))
      .send({ spreadsheetId: 'hoja-1' })
      .expect(200);

    const activated = await request(app.getHttpServer())
      .patch('/import/google-sheet/config/auto-import')
      .set('Authorization', auth(token))
      .send({ enabled: true })
      .expect(200);
    expect(activated.body.autoImportEnabled).toBe(true);

    const deactivated = await request(app.getHttpServer())
      .patch('/import/google-sheet/config/auto-import')
      .set('Authorization', auth(token))
      .send({ enabled: false })
      .expect(200);
    expect(deactivated.body.autoImportEnabled).toBe(false);
  });

  it('DELETE /config borra la hoja configurada', async () => {
    const user = await createUser('borrar-config@example.com');
    const token = await login(user.email);
    await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(token))
      .send({ spreadsheetId: 'hoja-a-borrar' })
      .expect(200);

    await request(app.getHttpServer()).delete('/import/google-sheet/config').set('Authorization', auth(token)).expect(204);

    const res = await request(app.getHttpServer()).get('/import/google-sheet/config').set('Authorization', auth(token)).expect(200);
    expect(res.body).toEqual({ serviceAccountEmail: fakeGoogleSheets.email, spreadsheetId: null, autoImportEnabled: false, lastRun: null });
  });

  it('aislamiento: la configuración de un usuario no es visible ni afectada por otro', async () => {
    const userA = await createUser('usuario-a@example.com');
    const tokenA = await login(userA.email);
    const userB = await createUser('usuario-b@example.com');
    const tokenB = await login(userB.email);

    await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(tokenA))
      .send({ spreadsheetId: 'hoja-de-a' })
      .expect(200);

    const resB = await request(app.getHttpServer()).get('/import/google-sheet/config').set('Authorization', auth(tokenB)).expect(200);
    expect(resB.body.spreadsheetId).toBeNull();

    await request(app.getHttpServer()).delete('/import/google-sheet/config').set('Authorization', auth(tokenB)).expect(204);

    const resA = await request(app.getHttpServer()).get('/import/google-sheet/config').set('Authorization', auth(tokenA)).expect(200);
    expect(resA.body.spreadsheetId).toBe('hoja-de-a');
  });

  it('POST /run sin hoja configurada responde 400', async () => {
    const user = await createUser('run-sin-hoja@example.com');
    const token = await login(user.email);

    await request(app.getHttpServer()).post('/import/google-sheet/run').set('Authorization', auth(token)).expect(400);
  });

  it('POST /run importa lo válido, y una segunda ejecución idéntica no duplica (spec 012)', async () => {
    const user = await createUser('run-ok@example.com');
    const token = await login(user.email);
    await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(token))
      .send({ spreadsheetId: 'hoja-run' })
      .expect(200);
    fakeGoogleSheets.fetchImpl = async () => workbookWithOneIncomeRow('Sueldo enero');

    const first = await request(app.getHttpServer()).post('/import/google-sheet/run').set('Authorization', auth(token)).expect(201);
    expect(first.body.income.importedCount).toBe(1);
    expect(first.body.categoriesCreated).toEqual(['Nómina']);

    const userTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
    expect(userTransactions).toHaveLength(1);

    const second = await request(app.getHttpServer()).post('/import/google-sheet/run').set('Authorization', auth(token)).expect(201);
    expect(second.body.income.importedCount).toBe(0);
    expect(second.body.income.skippedDuplicateCount).toBe(1);

    const afterSecondRun = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
    expect(afterSecondRun).toHaveLength(1);

    const config = await db.query.googleSheetsImportConfigs.findFirst({ where: eq(googleSheetsImportConfigs.userId, user.id) });
    expect(config?.lastRunError).toBeNull();
    expect(config?.lastRunResult).not.toBeNull();
  });

  // Corrección reportada por Diego: si en la hoja ya existía la fila pero
  // se corrige el importe (p. ej. a mano en Google Sheets), la siguiente
  // ejecución debe actualizar el importe del movimiento ya importado, no
  // crear uno duplicado.
  it('POST /run con el importe de una fila ya importada corregido actualiza el movimiento en vez de duplicarlo', async () => {
    const user = await createUser('run-importe-corregido@example.com');
    const token = await login(user.email);
    await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(token))
      .send({ spreadsheetId: 'hoja-importe-corregido' })
      .expect(200);
    fakeGoogleSheets.fetchImpl = async () => workbookWithOneIncomeRow('Sueldo enero');

    const first = await request(app.getHttpServer()).post('/import/google-sheet/run').set('Authorization', auth(token)).expect(201);
    expect(first.body.income.importedCount).toBe(1);

    fakeGoogleSheets.fetchImpl = async () => ({
      incomeRows: [{ rowNumber: 2, fecha: '2026-01-15', tipo: 'Nómina', concepto: 'Sueldo enero', valor: '2100' }],
      expenseRows: [],
    });

    const second = await request(app.getHttpServer()).post('/import/google-sheet/run').set('Authorization', auth(token)).expect(201);
    expect(second.body.income.importedCount).toBe(0);
    expect(second.body.income.skippedDuplicateCount).toBe(0);
    expect(second.body.income.updatedAmountCount).toBe(1);

    const userTransactions = await db.query.transactions.findMany({ where: eq(transactions.userId, user.id) });
    expect(userTransactions).toHaveLength(1); // no duplica: actualiza el importe del mismo movimiento
    expect(userTransactions[0].amount).toBe('2100.00');
  });

  it('POST /run con la hoja inaccesible responde 400 y deja constancia del error', async () => {
    const user = await createUser('run-error@example.com');
    const token = await login(user.email);
    await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(token))
      .send({ spreadsheetId: 'hoja-run-error' })
      .expect(200);
    fakeGoogleSheets.fetchImpl = async () => {
      throw new GoogleSheetAccessError('Se revocó el acceso a la hoja.');
    };

    await request(app.getHttpServer()).post('/import/google-sheet/run').set('Authorization', auth(token)).expect(400);

    const config = await db.query.googleSheetsImportConfigs.findFirst({ where: eq(googleSheetsImportConfigs.userId, user.id) });
    expect(config?.lastRunError).toMatch(/revocó/);
  });

  it('POST /run solapado para el mismo usuario responde 409 en la segunda', async () => {
    const user = await createUser('run-solape@example.com');
    const token = await login(user.email);
    await request(app.getHttpServer())
      .put('/import/google-sheet/config')
      .set('Authorization', auth(token))
      .send({ spreadsheetId: 'hoja-solape' })
      .expect(200);
    fakeGoogleSheets.fetchImpl = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { incomeRows: [], expenseRows: [] };
    };

    // `Promise.all` dispara el `.then()` de cada `Test` de supertest en el
    // mismo tick síncrono (que es lo que hace que superagent envíe la
    // petición) — las dos peticiones salen prácticamente a la vez, dentro
    // del margen de 150ms que tarda el `fetchImpl` simulado más arriba.
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/import/google-sheet/run').set('Authorization', auth(token)),
      request(app.getHttpServer()).post('/import/google-sheet/run').set('Authorization', auth(token)),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});
