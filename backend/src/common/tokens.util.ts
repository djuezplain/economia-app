import { randomBytes, createHash } from 'node:crypto';

/**
 * Tokens de un solo uso (verificación de email, reset de contraseña, refresh token):
 * se genera un valor aleatorio de alta entropía, se entrega en claro (email o cookie)
 * y solo se guarda su hash SHA-256 en BD (plan.md §1 — no hace falta argon2 aquí
 * porque no son contraseñas elegidas por humanos, son aleatorias).
 */
export function generateOpaqueToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString('hex');
  return { plaintext, hash: hashOpaqueToken(plaintext) };
}

export function hashOpaqueToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
