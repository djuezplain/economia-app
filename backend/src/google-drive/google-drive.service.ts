import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { GaxiosError } from 'gaxios';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { googleDriveConnections } from '../db/schema/index.js';
import { decryptSecret, encryptSecret } from '../common/secret-encryption.util.js';
import { DRIVE_FILE_SCOPE, DRIVE_FILES_URL, DRIVE_FOLDER_NAME, DRIVE_UPLOAD_URL } from './google-drive.constants.js';
import { AccountArchiveService, archiveFilename } from '../users/account-archive.service.js';

export type SaveConnectionResult = { ok: true } | { ok: false; reason: 'no_refresh_token' };

/**
 * Spec 032 H4, plan.md §9.5/§9.7: conexión de un usuario con su Google
 * Drive. Este fichero cubre tanto conectar/desconectar (plan.md §9.5, grupo
 * 6 de tasks.md) como la subida real del export (plan.md §9.7, grupo 7).
 */
@Injectable()
export class GoogleDriveService {
  constructor(
    private readonly config: ConfigService,
    private readonly archives: AccountArchiveService,
    @Inject(DB) private readonly db: Database,
  ) {}

  /**
   * Un `OAuth2Client` nuevo por llamada, sin estado compartido entre
   * peticiones de usuarios distintos — más simple y más seguro que
   * reutilizar una instancia (evita cualquier posibilidad de que las
   * credenciales de un usuario se cuelen en la petición de otro).
   */
  buildOAuthClient(): OAuth2Client {
    return new OAuth2Client({
      clientId: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      redirectUri: this.config.getOrThrow<string>('GOOGLE_DRIVE_CALLBACK_URL'),
    });
  }

  /**
   * `access_type: 'offline'` para recibir un refresh token; `prompt:
   * 'consent'` (plan.md §9.10 decisión 4) para que Google lo devuelva
   * siempre, incluso en una reconexión — por defecto Google solo lo manda
   * la primera vez que un usuario autoriza esta combinación app+cuenta.
   */
  buildAuthUrl(state: string): string {
    return this.buildOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_FILE_SCOPE],
      state,
    });
  }

  /**
   * Intercambia el `code` de la redirección de Google por sus tokens y
   * guarda el refresh token cifrado (`secret-encryption.util.ts`). Nunca se
   * guarda el access token (vive solo en memoria de cada petición — se pide
   * uno nuevo con el refresh token cada vez, plan.md §9.2).
   *
   * `ON CONFLICT (user_id) DO UPDATE`: una reconexión sustituye el refresh
   * token anterior y resetea `folderId` a `null` (plan.md §9.5 paso 2) — el
   * próximo export la reencuentra o la recrea sola.
   */
  async saveConnectionFromCode(userId: string, code: string): Promise<SaveConnectionResult> {
    const { tokens } = await this.buildOAuthClient().getToken(code);
    if (!tokens.refresh_token) {
      return { ok: false, reason: 'no_refresh_token' };
    }

    const refreshTokenEncrypted = encryptSecret(tokens.refresh_token);
    await this.db
      .insert(googleDriveConnections)
      .values({ userId, refreshTokenEncrypted })
      .onConflictDoUpdate({
        target: googleDriveConnections.userId,
        set: { refreshTokenEncrypted, folderId: null, updatedAt: new Date() },
      });
    return { ok: true };
  }

  async isConnected(userId: string): Promise<boolean> {
    return (await this.getConnectionRow(userId)) !== undefined;
  }

  /** Solo borra la conexión local — no revoca el acceso en Google (plan.md §9.10 decisión 6). */
  async disconnect(userId: string): Promise<void> {
    await this.db.delete(googleDriveConnections).where(eq(googleDriveConnections.userId, userId));
  }

  /**
   * Plan.md §9.7: sube la misma copia que descarga el usuario — desde la
   * spec 048, el `.zip` de `AccountArchiveService` (datos y documentos) — a
   * la carpeta propia de la app en su Drive, creándola si hiciera falta.
   */
  async exportToDrive(userId: string): Promise<{ fileId: string; webViewLink: string }> {
    const connection = await this.getConnectionRow(userId);
    if (!connection) {
      throw new NotFoundException('Conecta Google Drive primero.');
    }

    const client = this.buildOAuthClient();
    client.setCredentials({ refresh_token: decryptSecret(connection.refreshTokenEncrypted) });

    const folderId = await this.ensureFolder(client, userId, connection.folderId);
    // Spec 048 plan.md §3.4: el `.zip` (datos y documentos) se escribe en un
    // temporal y se sube desde él; el temporal se borra siempre.
    const tempFile = path.join(tmpdir(), `economia-drive-${randomUUID()}.zip`);
    try {
      const { sizeBytes } = await this.archives.writeArchive(userId, tempFile);
      return await this.uploadResumable(client, folderId, archiveFilename(), tempFile, sizeBytes);
    } finally {
      await fs.rm(tempFile, { force: true });
    }
  }

  private async getConnectionRow(userId: string) {
    return this.db.query.googleDriveConnections.findFirst({ where: eq(googleDriveConnections.userId, userId) });
  }

  /**
   * Perezoso (plan.md §9.10 decisión 3): si `folderId` ya está guardado se
   * comprueba que la carpeta siga existiendo y no esté en la papelera —
   * tolera que el usuario la manipule a mano en Drive entre dos exports. Si
   * no hay `folderId` o ya no vale, busca por nombre (con `drive.file` solo
   * puede encontrar una carpeta que la propia app ya haya creado antes) y,
   * si tampoco existe, la crea. El resultado se guarda para la próxima vez.
   */
  private async ensureFolder(client: OAuth2Client, userId: string, existingFolderId: string | null): Promise<string> {
    if (existingFolderId && (await this.folderStillValid(client, existingFolderId))) {
      return existingFolderId;
    }

    const folderId = (await this.findFolderByName(client)) ?? (await this.createFolder(client));
    await this.db
      .update(googleDriveConnections)
      .set({ folderId, updatedAt: new Date() })
      .where(eq(googleDriveConnections.userId, userId));
    return folderId;
  }

  private async folderStillValid(client: OAuth2Client, folderId: string): Promise<boolean> {
    try {
      const res = await client.request<{ id: string; trashed?: boolean }>({
        url: `${DRIVE_FILES_URL}/${folderId}`,
        params: { fields: 'id,trashed' },
      });
      return res.data.trashed !== true;
    } catch (err) {
      if (isNotFoundError(err)) return false;
      throw wrapDriveError(err);
    }
  }

  private async findFolderByName(client: OAuth2Client): Promise<string | undefined> {
    try {
      const res = await client.request<{ files?: { id: string }[] }>({
        url: DRIVE_FILES_URL,
        params: {
          q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id)',
          spaces: 'drive',
        },
      });
      return res.data.files?.[0]?.id;
    } catch (err) {
      throw wrapDriveError(err);
    }
  }

  private async createFolder(client: OAuth2Client): Promise<string> {
    try {
      const res = await client.request<{ id: string }>({
        url: DRIVE_FILES_URL,
        method: 'POST',
        data: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
      });
      return res.data.id;
    } catch (err) {
      throw wrapDriveError(err);
    }
  }

  /**
   * Spec 048 plan.md §3.4: subida reanudable (`uploadType=resumable`) en vez
   * de `multipart`, que Drive limita a 5 MB — con documentos la copia los
   * supera enseguida. Dos pasos: abrir la sesión con los metadatos (Drive
   * devuelve la URL de subida en `Location`) y enviar el fichero en
   * streaming desde disco, sin cargarlo en memoria.
   */
  private async uploadResumable(
    client: OAuth2Client,
    folderId: string,
    filename: string,
    filePath: string,
    sizeBytes: number,
  ): Promise<{ fileId: string; webViewLink: string }> {
    try {
      const session = await client.request({
        url: DRIVE_UPLOAD_URL,
        method: 'POST',
        params: { uploadType: 'resumable', fields: 'id,webViewLink' },
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'application/zip',
          'X-Upload-Content-Length': String(sizeBytes),
        },
        data: { name: filename, parents: [folderId], mimeType: 'application/zip' },
      });
      const location = headerValue(session.headers, 'location');
      if (!location) throw new Error('Google Drive no ha devuelto la URL de subida.');

      const res = await client.request<{ id: string; webViewLink: string }>({
        url: location,
        method: 'PUT',
        headers: { 'Content-Type': 'application/zip', 'Content-Length': String(sizeBytes) },
        data: createReadStream(filePath),
      });
      return { fileId: res.data.id, webViewLink: res.data.webViewLink };
    } catch (err) {
      throw wrapDriveError(err);
    }
  }
}

/** Las cabeceras de gaxios llegan como `Headers` (gaxios 7) o como objeto plano. */
function headerValue(headers: unknown, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const value = (headers as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof GaxiosError && (err.status ?? err.response?.status) === 404;
}

/**
 * Plan.md §9.7 — errores: 401/`invalid_grant` (token revocado desde fuera
 * de la app, p. ej. el usuario quitó el permiso en
 * myaccount.google.com/permissions) da un mensaje que pide reconectar, sin
 * borrar la conexión sola (plan.md §9.10 decisión 6); cualquier otro fallo
 * (cuota, 5xx de Google) da un mensaje genérico de "inténtalo más tarde".
 */
function wrapDriveError(err: unknown): BadRequestException {
  if (err instanceof GaxiosError) {
    const status = err.status ?? err.response?.status;
    const bodyText = JSON.stringify(err.response?.data ?? '');
    if (status === 401 || bodyText.includes('invalid_grant')) {
      return new BadRequestException(
        'El acceso a Google Drive ha caducado o ha sido revocado. Desconecta y vuelve a conectar Google Drive.',
      );
    }
  }
  return new BadRequestException('No se ha podido guardar el fichero en Google Drive. Inténtalo de nuevo más tarde.');
}
