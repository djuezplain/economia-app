import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from './secret-encryption.util.js';

describe('secret-encryption.util', () => {
  const originalKey = process.env.DRIVE_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it('descifra exactamente lo que cifró (round-trip)', () => {
    const plaintext = '1//0g-example-refresh-token-value';
    const stored = encryptSecret(plaintext);
    expect(stored).not.toContain(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });

  it('cifrar el mismo texto dos veces da resultados distintos (IV aleatorio)', () => {
    const a = encryptSecret('mismo-texto');
    const b = encryptSecret('mismo-texto');
    expect(a).not.toBe(b);
  });

  it('no descifra con una clave distinta a la usada para cifrar', () => {
    const stored = encryptSecret('secreto');
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(() => decryptSecret(stored)).toThrow();
  });

  it('lanza con un valor corrupto en vez de devolver basura', () => {
    expect(() => decryptSecret('no-tiene-el-formato-esperado')).toThrow();

    const stored = encryptSecret('un-texto-suficientemente-largo-para-notar-el-cambio');
    const [iv, authTag, ciphertext] = stored.split('.');
    // Cambia un carácter dentro del auth tag (no al final, tras el padding
    // `=`, que Node ignora al decodificar base64) — así el bit realmente
    // cambia y `setAuthTag` no puede validar el ciphertext.
    const tamperedAuthTag = authTag[0] === 'A' ? `B${authTag.slice(1)}` : `A${authTag.slice(1)}`;
    expect(() => decryptSecret([iv, tamperedAuthTag, ciphertext].join('.'))).toThrow();
  });

  it('exige que la clave configurada tenga 32 bytes en base64', () => {
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = Buffer.from('demasiado-corta').toString('base64');
    expect(() => encryptSecret('x')).toThrow();
  });
});
