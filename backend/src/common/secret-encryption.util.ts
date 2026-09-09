import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/**
 * Cifrado en reposo de secretos de terceros (plan.md spec 032 §9.3 — hoy solo
 * el refresh token de Drive, `google-drive.schema.ts`). AES-256-GCM con la
 * clave en `DRIVE_TOKEN_ENCRYPTION_KEY` (32 bytes en base64): cada llamada a
 * `encryptSecret` genera un IV nuevo, así que cifrar el mismo texto dos veces
 * da resultados distintos (no determinista, evita filtrar por comparación de
 * ciphertexts iguales). El formato guardado es `iv.authTag.ciphertext`, cada
 * parte en base64 — un solo campo de texto en BD, sin columnas separadas.
 *
 * No tiene guard propio: quien la llama (`GoogleDriveConfiguredGuard`) ya ha
 * comprobado que `DRIVE_TOKEN_ENCRYPTION_KEY` está configurada antes de que
 * la petición llegue aquí.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFromEnv(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((buf) => buf.toString('base64')).join('.');
}

export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 3) {
    throw new Error('Formato de secreto cifrado inválido.');
  }
  const [iv, authTag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv(ALGORITHM, keyFromEnv(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function keyFromEnv(): Buffer {
  const raw = process.env.DRIVE_TOKEN_ENCRYPTION_KEY ?? '';
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('DRIVE_TOKEN_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64.');
  }
  return key;
}
