// Debe reflejar exactamente la política del backend
// (backend/src/common/is-strong-password.decorator.ts, spec 001 §4):
// mínimo 10 caracteres, al menos una letra y un número.
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener al menos 10 caracteres, incluyendo una letra y un número.';

export function isStrongPassword(password: string): boolean {
  return STRONG_PASSWORD_REGEX.test(password);
}
