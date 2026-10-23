import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { readZip } from './support/zip.js';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { googleDriveConnections, scheduledExports, users } from '../src/db/schema/index.js';
import { ScheduledExportsService } from '../src/scheduled-exports/scheduled-exports.service.js';
import type { ScheduledExportRow } from '../src/scheduled-exports/scheduled-exports.service.js';

/**
 * Spec 032 H5, plan.md §11.10 (T12.1). Las rutas CRUD se prueban por HTTP;
 * `ScheduledExportsService.run()` (destino LOCAL) se prueba llamándolo
 * directamente contra un directorio real bajo `SCHEDULED_EXPORT_LOCAL_DIR`
 * (`.env.test` → `./scheduled-exports-test`, en `.gitignore`) — mismo
 * criterio que otras specs de este proyecto que prefieren la app/BD real a
 * mocks cuando es sencillo montarlo (ver nota de T2.1, spec 032 H1-H4).
 */
describe('Exportación programada (e2e) — spec 032 H5', () => {
  let app: INestApplication<App>;
  let db: Database;
  let scheduledExportsService: ScheduledExportsService;
  let localDir: string;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    db = moduleFixture.get<Database>(DB);
    scheduledExportsService = moduleFixture.get<ScheduledExportsService>(ScheduledExportsService);
    localDir = moduleFixture.get<ConfigService>(ConfigService).get<string>('SCHEDULED_EXPORT_LOCAL_DIR')!;
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(localDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await db.delete(googleDriveConnections);
    await db.delete(users);
    await fs.rm(localDir, { recursive: true, force: true });
  });

  async function createActiveUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status: 'ACTIVE' }).returning();
    return user;
  }

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  const DAILY_LOCAL = { enabled: true, frequency: 'DAILY', timeOfDay: '03:00', destination: 'LOCAL' };
  const WEEKLY_LOCAL = { enabled: true, frequency: 'WEEKLY', dayOfWeek: 1, timeOfDay: '03:00', destination: 'LOCAL' };

  describe('sin sesión', () => {
    it('GET/PUT/DELETE responden 401', async () => {
      await request(app.getHttpServer()).get('/scheduled-exports').expect(401);
      await request(app.getHttpServer()).put('/scheduled-exports').send(DAILY_LOCAL).expect(401);
      await request(app.getHttpServer()).delete('/scheduled-exports').expect(401);
    });
  });

  describe('PUT /scheduled-exports', () => {
    it('guarda una configuración diaria válida (destino LOCAL)', async () => {
      const user = await createActiveUser('sched-daily@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send(DAILY_LOCAL)
        .expect(200);

      expect(res.body).toMatchObject({ enabled: true, frequency: 'DAILY', timeOfDay: '03:00', destination: 'LOCAL', dayOfWeek: null, dayOfMonth: null });
    });

    it('guarda una configuración semanal válida', async () => {
      const user = await createActiveUser('sched-weekly@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send(WEEKLY_LOCAL)
        .expect(200);

      expect(res.body).toMatchObject({ frequency: 'WEEKLY', dayOfWeek: 1, dayOfMonth: null });
    });

    it('WEEKLY sin dayOfWeek → 400, no guarda nada', async () => {
      const user = await createActiveUser('sched-weekly-sin-dia@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send({ enabled: true, frequency: 'WEEKLY', timeOfDay: '03:00', destination: 'LOCAL' })
        .expect(400);

      const [row] = await db.select().from(scheduledExports).where(eq(scheduledExports.userId, user.id));
      expect(row).toBeUndefined();
    });

    it('MONTHLY con dayOfMonth: 31 → 400 (fuera de rango 1-28)', async () => {
      const user = await createActiveUser('sched-monthly-31@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send({ enabled: true, frequency: 'MONTHLY', dayOfMonth: 31, timeOfDay: '03:00', destination: 'LOCAL' })
        .expect(400);
    });

    it('DAILY con un dayOfWeek de más → 400 (no aplica a esta periodicidad)', async () => {
      const user = await createActiveUser('sched-daily-con-dia@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send({ ...DAILY_LOCAL, dayOfWeek: 1 })
        .expect(400);
    });

    it('destino DRIVE sin conexión previa → 400, pidiendo conectar primero', async () => {
      const user = await createActiveUser('sched-drive-sin-conexion@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send({ ...DAILY_LOCAL, destination: 'DRIVE' })
        .expect(400);

      expect(res.body.message).toMatch(/conecta google drive/i);
    });

    it('destino DRIVE con conexión ya existente → 200', async () => {
      const user = await createActiveUser('sched-drive-conectado@example.com');
      const token = await login(user.email);
      await db.insert(googleDriveConnections).values({ userId: user.id, refreshTokenEncrypted: 'cualquier-cosa-cifrada' });

      const res = await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send({ ...DAILY_LOCAL, destination: 'DRIVE' })
        .expect(200);

      expect(res.body.destination).toBe('DRIVE');
    });

    it('guardar con enabled: false y destino DRIVE no exige conexión', async () => {
      const user = await createActiveUser('sched-drive-desactivado@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send({ ...DAILY_LOCAL, enabled: false, destination: 'DRIVE' })
        .expect(200);
    });

    it('volver a guardar hace upsert, sin duplicar fila', async () => {
      const user = await createActiveUser('sched-upsert@example.com');
      const token = await login(user.email);

      await request(app.getHttpServer()).put('/scheduled-exports').set('Authorization', auth(token)).send(DAILY_LOCAL).expect(200);
      await request(app.getHttpServer()).put('/scheduled-exports').set('Authorization', auth(token)).send(WEEKLY_LOCAL).expect(200);

      const rows = await db.select().from(scheduledExports).where(eq(scheduledExports.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].frequency).toBe('WEEKLY');
    });
  });

  describe('GET /scheduled-exports', () => {
    it('sin configuración previa, devuelve null', async () => {
      const user = await createActiveUser('sched-get-vacio@example.com');
      const token = await login(user.email);

      const res = await request(app.getHttpServer()).get('/scheduled-exports').set('Authorization', auth(token)).expect(200);
      // Nota de implementación: `ScheduledExportsController.get()` usa
      // `@Res()` + `res.json(row)` en vez de devolver el valor tal cual —
      // Nest trata un controller que resuelve a `null` como "sin cuerpo" y
      // manda la respuesta vacía en vez de JSON `null` (encontrado al
      // verificar esta ruta en un navegador real: `fetch(...).json()`
      // fallaba con `SyntaxError` pese al 200). `res.json(null)` de Express
      // sí serializa `null` de verdad, comprobado aquí por el texto crudo.
      expect(res.text).toBe('null');
      const [row] = await db.select().from(scheduledExports).where(eq(scheduledExports.userId, user.id));
      expect(row).toBeUndefined();
    });

    it('aislamiento — la config de un usuario nunca aparece en el GET de otro', async () => {
      const owner = await createActiveUser('sched-aislamiento-dueno@example.com');
      const other = await createActiveUser('sched-aislamiento-otro@example.com');
      await request(app.getHttpServer()).put('/scheduled-exports').set('Authorization', auth(await login(owner.email))).send(DAILY_LOCAL).expect(200);

      const res = await request(app.getHttpServer()).get('/scheduled-exports').set('Authorization', auth(await login(other.email))).expect(200);
      expect(res.text).toBe('null');
    });
  });

  describe('DELETE /scheduled-exports', () => {
    it('desactiva sin borrar la configuración (H5 criterio 4)', async () => {
      const user = await createActiveUser('sched-desactivar@example.com');
      const token = await login(user.email);
      await request(app.getHttpServer()).put('/scheduled-exports').set('Authorization', auth(token)).send(WEEKLY_LOCAL).expect(200);

      await request(app.getHttpServer()).delete('/scheduled-exports').set('Authorization', auth(token)).expect(204);

      const res = await request(app.getHttpServer()).get('/scheduled-exports').set('Authorization', auth(token)).expect(200);
      expect(res.body).toMatchObject({ enabled: false, frequency: 'WEEKLY', dayOfWeek: 1, timeOfDay: '03:00', destination: 'LOCAL' });
    });
  });

  describe('ScheduledExportsService.run() — destino LOCAL', () => {
    async function savedRow(email: string, overrides: Partial<typeof DAILY_LOCAL & { localSubfolder: string }> = {}): Promise<{ user: Awaited<ReturnType<typeof createActiveUser>>; row: ScheduledExportRow }> {
      const user = await createActiveUser(email);
      const token = await login(user.email);
      await request(app.getHttpServer())
        .put('/scheduled-exports')
        .set('Authorization', auth(token))
        .send({ ...DAILY_LOCAL, ...overrides })
        .expect(200);
      const row = (await db.query.scheduledExports.findFirst({ where: eq(scheduledExports.userId, user.id) }))!;
      return { user, row };
    }

    it('escribe el fichero en <dir>/<userId>/ y marca lastRunAt sin error', async () => {
      const { user, row } = await savedRow('sched-run-local@example.com');

      await scheduledExportsService.run(row);

      const dir = path.join(localDir, user.id);
      const files = await fs.readdir(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^economia-app-datos-\d{4}-\d{2}-\d{2}\.zip$/);

      // Spec 048: la misma copia .zip que la descarga manual.
      const entries = await readZip(await fs.readFile(path.join(dir, files[0])));
      const content = JSON.parse(entries.get('datos.json')!.toString());
      expect(content.profile.id).toBe(user.id);

      const [updated] = await db.select().from(scheduledExports).where(eq(scheduledExports.id, row.id));
      expect(updated.lastRunAt).not.toBeNull();
      expect(updated.lastRunError).toBeNull();
    });

    it('respeta la subcarpeta configurada, saneada', async () => {
      const { user, row } = await savedRow('sched-run-subcarpeta@example.com', { localSubfolder: '../../etc/mis backups' });

      await scheduledExportsService.run(row);

      // ".." se elimina — la carpeta resultante queda dentro de la del usuario.
      const files = await fs.readdir(path.join(localDir, user.id, 'etc/mis backups'));
      expect(files).toHaveLength(1);
    });

    it('una ejecución purga ficheros propios de más de 14 días, sin tocar los recientes', async () => {
      const { user, row } = await savedRow('sched-run-purga@example.com');
      const dir = path.join(localDir, user.id);
      await fs.mkdir(dir, { recursive: true });

      // Fichero "antiguo" fabricado a mano (con el mismo patrón de nombre que
      // escribe el propio servicio) para no depender de manipular el reloj.
      // Spec 048: se purgan tanto los .zip como los .json de antes del cambio;
      // un fichero ajeno al patrón no se toca.
      const oldFiles = ['economia-app-datos-2026-01-01.json', 'economia-app-datos-2026-01-02.zip'];
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      for (const oldFile of [...oldFiles, 'notas.txt']) {
        await fs.writeFile(path.join(dir, oldFile), '{}', 'utf-8');
        await fs.utimes(path.join(dir, oldFile), fifteenDaysAgo, fifteenDaysAgo);
      }

      await scheduledExportsService.run(row);

      const filesAfter = await fs.readdir(dir);
      for (const oldFile of oldFiles) expect(filesAfter).not.toContain(oldFile);
      expect(filesAfter).toHaveLength(2); // el recién escrito por run() y notas.txt.
      expect(filesAfter).toContain('notas.txt');
      expect(filesAfter.some((f) => f.endsWith('.partial'))).toBe(false);
    });

    it('destino DRIVE sin conexión real deja lastRunError y relanza (para que el scheduler lo loguee)', async () => {
      const { row } = await savedRow('sched-run-drive-falla@example.com', { destination: 'LOCAL' });
      // Se guarda como LOCAL (una conexión Drive no existe en este entorno de test)
      // y se fuerza el destino a DRIVE en el objeto pasado a `run()` directamente,
      // sin pasar por el guard de `save()` — comprueba que `run()` también sabe
      // fallar con gracia (registrando el error) si algo se cuela sin conexión.
      const driveRow: ScheduledExportRow = { ...row, destination: 'DRIVE' };

      await expect(scheduledExportsService.run(driveRow)).rejects.toThrow();

      const [updated] = await db.select().from(scheduledExports).where(eq(scheduledExports.id, row.id));
      expect(updated.lastRunError).not.toBeNull();
    });
  });
});
