import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GaxiosError } from 'gaxios';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { googleDriveConnections, users } from '../src/db/schema/index.js';
import { GoogleDriveService } from '../src/google-drive/google-drive.service.js';
import { DRIVE_FILES_URL, DRIVE_UPLOAD_URL } from '../src/google-drive/google-drive.constants.js';
import { UsersService } from '../src/users/users.service.js';
import { decryptSecret } from '../src/common/secret-encryption.util.js';

/**
 * Spec 032 H4, plan.md §9.5-§9.6 (T6.5). GOOGLE_CLIENT_ID/SECRET siguen
 * vacíos en `.env.test` (mismo criterio que `auth-google.e2e-spec.ts` —
 * constitution.md: el proyecto sigue funcionando sin credenciales reales de
 * Google todavía), así que las 4 rutas HTTP de Drive se prueban aquí solo en
 * su comportamiento "no configurado" (503). La lógica de negocio real
 * (`GoogleDriveService`) se prueba llamándola directamente, con
 * `buildOAuthClient()` sustituido para no llamar a Google de verdad — mismo
 * patrón que `auth-google.e2e-spec.ts` usa para `AuthService.loginWithGoogleProfile`.
 */
describe('Conexión con Google Drive (e2e) — spec 032 H4', () => {
  let app: INestApplication<App>;
  let db: Database;
  let googleDrive: GoogleDriveService;
  let usersService: UsersService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    db = moduleFixture.get<Database>(DB);
    googleDrive = moduleFixture.get<GoogleDriveService>(GoogleDriveService);
    usersService = moduleFixture.get<UsersService>(UsersService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await db.delete(googleDriveConnections);
    await db.delete(users);
  });

  const PASSWORD = 'Contraseña-Segura-123';

  async function createActiveUser(email: string) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: 'Usuario Drive', status: 'ACTIVE' })
      .returning();
    return user;
  }

  async function loginAccessToken(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  /** Sustituye `buildOAuthClient()` por un doble sin red — `getToken` devuelve los tokens dados. */
  function mockOAuthClient(tokens: { refresh_token?: string | null }) {
    return vi.spyOn(googleDrive, 'buildOAuthClient').mockReturnValue({
      getToken: vi.fn().mockResolvedValue({ tokens }),
    } as never);
  }

  async function connectUser(email: string) {
    const user = await createActiveUser(email);
    mockOAuthClient({ refresh_token: `refresh-token-${email}` });
    await googleDrive.saveConnectionFromCode(user.id, 'connect-code');
    vi.restoreAllMocks();
    return user;
  }

  function fakeGaxiosError(status: number, dataText = ''): GaxiosError {
    return new GaxiosError('Gaxios error', {} as never, {
      status,
      data: dataText,
      config: {},
      bodyUsed: true,
      headers: new Headers(),
    } as never);
  }

  /**
   * Doble de `OAuth2Client.request()` — responde según la URL/método,
   * simulando la API real de Drive (plan.md §9.7) sin red. `calls` recoge
   * cada llamada para poder comprobar cuántas veces (y con qué) se llamó.
   */
  function mockDriveApiClient(handlers: {
    getFolder?: (folderId: string) => { trashed?: boolean } | GaxiosError;
    findFolder?: () => { files: { id: string }[] } | GaxiosError;
    createFolder?: () => { id: string } | GaxiosError;
    upload?: (content: string) => { id: string; webViewLink: string } | GaxiosError;
  }) {
    const calls: { url: string; method?: string }[] = [];
    const requestFn = vi.fn(async (opts: { url: string; method?: string; params?: { q?: string }; multipart?: { content: string }[] }) => {
      calls.push({ url: opts.url, method: opts.method });

      if (opts.url.startsWith(`${DRIVE_FILES_URL}/`)) {
        const folderId = opts.url.slice(`${DRIVE_FILES_URL}/`.length);
        const result = handlers.getFolder?.(folderId) ?? { trashed: false };
        if (result instanceof GaxiosError) throw result;
        return { data: { id: folderId, ...result } };
      }
      if (opts.url === DRIVE_FILES_URL && opts.method === 'POST') {
        const result = handlers.createFolder?.() ?? { id: 'created-folder-id' };
        if (result instanceof GaxiosError) throw result;
        return { data: result };
      }
      if (opts.url === DRIVE_FILES_URL) {
        const result = handlers.findFolder?.() ?? { files: [] };
        if (result instanceof GaxiosError) throw result;
        return { data: result };
      }
      if (opts.url === DRIVE_UPLOAD_URL) {
        const content = opts.multipart?.[1]?.content ?? '';
        const result = handlers.upload?.(content) ?? { id: 'uploaded-file-id', webViewLink: 'https://drive.google.com/file/d/uploaded-file-id/view' };
        if (result instanceof GaxiosError) throw result;
        return { data: result };
      }
      throw new Error(`URL no esperada en el test: ${opts.method ?? 'GET'} ${opts.url}`);
    });

    vi.spyOn(googleDrive, 'buildOAuthClient').mockReturnValue({
      setCredentials: vi.fn(),
      request: requestFn,
    } as never);

    return { calls, requestFn };
  }

  describe('rutas HTTP sin credenciales de Google configuradas', () => {
    it('GET /auth/drive/connect responde 503', async () => {
      await request(app.getHttpServer()).get('/auth/drive/connect').expect(503);
    });

    it('GET /auth/drive/callback responde 503', async () => {
      await request(app.getHttpServer()).get('/auth/drive/callback').expect(503);
    });

    // `GoogleDriveConfiguredGuard` va después de `AuthGuard`/`RequireActiveUserGuard`
    // en la cadena (§9.6) — hace falta autenticar primero para llegar a él,
    // igual que cualquier otra ruta de datos económicos.
    it('GET /drive/connection, ya autenticado, responde 503', async () => {
      const user = await createActiveUser('drive-status-unconfigured@example.com');
      const accessToken = await loginAccessToken(user.email);
      await request(app.getHttpServer()).get('/drive/connection').set('Authorization', `Bearer ${accessToken}`).expect(503);
    });

    it('DELETE /drive/connection, ya autenticado, responde 503', async () => {
      const user = await createActiveUser('drive-disconnect-unconfigured@example.com');
      const accessToken = await loginAccessToken(user.email);
      await request(app.getHttpServer())
        .delete('/drive/connection')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(503);
    });
  });

  describe('GoogleDriveService.saveConnectionFromCode', () => {
    it('guarda el refresh token cifrado (nunca en claro) en la BD', async () => {
      const user = await createActiveUser('drive-connect-1@example.com');
      mockOAuthClient({ refresh_token: 'plaintext-refresh-token-value' });

      const result = await googleDrive.saveConnectionFromCode(user.id, 'fake-code');
      expect(result).toEqual({ ok: true });

      const [row] = await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.userId, user.id));
      expect(row.refreshTokenEncrypted).not.toContain('plaintext-refresh-token-value');
      expect(decryptSecret(row.refreshTokenEncrypted)).toBe('plaintext-refresh-token-value');
      expect(row.folderId).toBeNull();
    });

    it('sin refresh_token en la respuesta de Google, no escribe nada y lo señala', async () => {
      const user = await createActiveUser('drive-connect-2@example.com');
      mockOAuthClient({ refresh_token: null });

      const result = await googleDrive.saveConnectionFromCode(user.id, 'fake-code');
      expect(result).toEqual({ ok: false, reason: 'no_refresh_token' });

      const rows = await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.userId, user.id));
      expect(rows).toHaveLength(0);
    });

    it('una reconexión hace upsert (sin duplicar fila) y resetea folderId', async () => {
      const user = await createActiveUser('drive-reconnect@example.com');

      mockOAuthClient({ refresh_token: 'first-token' });
      await googleDrive.saveConnectionFromCode(user.id, 'code-1');
      // Simula que un export previo ya había resuelto una carpeta.
      await db
        .update(googleDriveConnections)
        .set({ folderId: 'folder-abc' })
        .where(eq(googleDriveConnections.userId, user.id));

      mockOAuthClient({ refresh_token: 'second-token' });
      await googleDrive.saveConnectionFromCode(user.id, 'code-2');

      const rows = await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(decryptSecret(rows[0].refreshTokenEncrypted)).toBe('second-token');
      expect(rows[0].folderId).toBeNull();
    });
  });

  describe('isConnected / disconnect', () => {
    it('refleja conectado/no conectado, aislado por usuario', async () => {
      const userA = await createActiveUser('drive-status-a@example.com');
      const userB = await createActiveUser('drive-status-b@example.com');

      expect(await googleDrive.isConnected(userA.id)).toBe(false);

      mockOAuthClient({ refresh_token: 'token-a' });
      await googleDrive.saveConnectionFromCode(userA.id, 'code-a');

      expect(await googleDrive.isConnected(userA.id)).toBe(true);
      expect(await googleDrive.isConnected(userB.id)).toBe(false);
    });

    it('desconectar borra solo la fila del usuario indicado, sin tocar la de otro', async () => {
      const userA = await createActiveUser('drive-disconnect-a@example.com');
      const userB = await createActiveUser('drive-disconnect-b@example.com');

      mockOAuthClient({ refresh_token: 'token-a' });
      await googleDrive.saveConnectionFromCode(userA.id, 'code-a');
      mockOAuthClient({ refresh_token: 'token-b' });
      await googleDrive.saveConnectionFromCode(userB.id, 'code-b');

      await googleDrive.disconnect(userA.id);

      expect(await googleDrive.isConnected(userA.id)).toBe(false);
      expect(await googleDrive.isConnected(userB.id)).toBe(true);
    });
  });

  describe('GoogleDriveService.exportToDrive — plan.md §9.7 (T7.3)', () => {
    it('sin conexión previa, lanza con un mensaje claro y no llama a Google', async () => {
      const user = await createActiveUser('drive-export-sin-conexion@example.com');
      await expect(googleDrive.exportToDrive(user.id)).rejects.toThrow('Conecta Google Drive primero.');
    });

    it('sin folderId guardado, busca por nombre, crea la carpeta si no existe y la reutiliza en el siguiente export', async () => {
      const user = await connectUser('drive-export-crea-carpeta@example.com');

      const first = mockDriveApiClient({
        findFolder: () => ({ files: [] }),
        createFolder: () => ({ id: 'folder-nueva' }),
        upload: () => ({ id: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view' }),
      });
      const result = await googleDrive.exportToDrive(user.id);

      expect(result).toEqual({ fileId: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view' });
      expect(first.calls.map((c) => `${c.method ?? 'GET'} ${c.url}`)).toEqual([
        `GET ${DRIVE_FILES_URL}`,
        `POST ${DRIVE_FILES_URL}`,
        `POST ${DRIVE_UPLOAD_URL}`,
      ]);

      const [row] = await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.userId, user.id));
      expect(row.folderId).toBe('folder-nueva');

      // Segundo export: ya hay folderId guardado — solo comprueba que sigue
      // existiendo (una llamada), sin volver a buscar ni crear.
      const second = mockDriveApiClient({
        getFolder: () => ({ trashed: false }),
        upload: () => ({ id: 'file-2', webViewLink: 'https://drive.google.com/file/d/file-2/view' }),
      });
      await googleDrive.exportToDrive(user.id);
      expect(second.calls.map((c) => `${c.method ?? 'GET'} ${c.url}`)).toEqual([
        `GET ${DRIVE_FILES_URL}/folder-nueva`,
        `POST ${DRIVE_UPLOAD_URL}`,
      ]);
    });

    it('con folderId guardado pero la carpeta ya no existe (borrada/papelera en Drive), la recrea sola', async () => {
      const user = await connectUser('drive-export-carpeta-borrada@example.com');
      await db.update(googleDriveConnections).set({ folderId: 'folder-borrada' }).where(eq(googleDriveConnections.userId, user.id));

      const notFound = mockDriveApiClient({
        getFolder: () => fakeGaxiosError(404),
        findFolder: () => ({ files: [] }),
        createFolder: () => ({ id: 'folder-recreada' }),
      });
      await googleDrive.exportToDrive(user.id);
      expect(notFound.calls.map((c) => c.url)).toEqual([
        `${DRIVE_FILES_URL}/folder-borrada`,
        DRIVE_FILES_URL,
        DRIVE_FILES_URL,
        DRIVE_UPLOAD_URL,
      ]);

      const [row] = await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.userId, user.id));
      expect(row.folderId).toBe('folder-recreada');

      // Papelera (200, `trashed: true`) se trata igual que "no existe".
      const trashed = mockDriveApiClient({
        getFolder: () => ({ trashed: true }),
        findFolder: () => ({ files: [{ id: 'folder-recreada' }] }),
      });
      await googleDrive.exportToDrive(user.id);
      expect(trashed.calls.map((c) => c.url)).toEqual([`${DRIVE_FILES_URL}/folder-recreada`, DRIVE_FILES_URL, DRIVE_UPLOAD_URL]);
    });

    it('con el token revocado (401), da un error claro pidiendo reconectar y no borra la conexión', async () => {
      const user = await connectUser('drive-export-token-revocado@example.com');
      mockDriveApiClient({ findFolder: () => fakeGaxiosError(401, JSON.stringify({ error: 'invalid_grant' })) });

      await expect(googleDrive.exportToDrive(user.id)).rejects.toThrow(/Desconecta y vuelve a conectar/);

      expect(await googleDrive.isConnected(user.id)).toBe(true);
    });

    it('con un fallo genérico de Drive (5xx), da un error claro sin mencionar reconectar', async () => {
      const user = await connectUser('drive-export-fallo-generico@example.com');
      mockDriveApiClient({ findFolder: () => fakeGaxiosError(500) });

      await expect(googleDrive.exportToDrive(user.id)).rejects.toThrow('No se ha podido guardar el fichero en Google Drive. Inténtalo de nuevo más tarde.');
    });

    it('el fichero subido es exactamente el mismo AccountExport que expondría GET /users/me/export', async () => {
      const user = await connectUser('drive-export-contenido@example.com');
      let uploadedContent = '';
      mockDriveApiClient({
        findFolder: () => ({ files: [{ id: 'folder-x' }] }),
        upload: (content) => {
          uploadedContent = content;
          return { id: 'file-x', webViewLink: 'https://drive.google.com/file/d/file-x/view' };
        },
      });

      await googleDrive.exportToDrive(user.id);
      const uploaded = JSON.parse(uploadedContent) as Record<string, unknown>;
      const expected = await usersService.exportData(user.id);

      expect(uploaded.formatVersion).toBe(expected.formatVersion);
      expect(uploaded.profile).toEqual(JSON.parse(JSON.stringify(expected.profile)));
      expect(uploaded.economicData).toEqual(JSON.parse(JSON.stringify(expected.economicData)));
    });
  });
});
