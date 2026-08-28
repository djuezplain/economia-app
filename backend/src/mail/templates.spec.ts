import { describe, expect, it } from 'vitest';
import { accountDeletedEmail, alreadyRegisteredEmail, passwordResetEmail, verificationEmail } from './templates.js';

describe('mail templates', () => {
  it('verificationEmail se renderiza con datos de ejemplo sin lanzar error', () => {
    const msg = verificationEmail({
      to: 'ana@example.com',
      name: 'Ana',
      verifyUrl: 'http://localhost:5173/verify-email?token=abc',
    });
    expect(msg.to).toBe('ana@example.com');
    expect(msg.html).toContain('abc');
    expect(msg.text).toContain('abc');
  });

  it('alreadyRegisteredEmail se renderiza con datos de ejemplo sin lanzar error', () => {
    const msg = alreadyRegisteredEmail({
      to: 'ana@example.com',
      name: 'Ana',
      forgotPasswordUrl: 'http://localhost:5173/forgot-password',
    });
    expect(msg.subject).toBe('Ya tienes una cuenta');
    expect(msg.html).toContain('forgot-password');
  });

  it('passwordResetEmail se renderiza con datos de ejemplo sin lanzar error', () => {
    const msg = passwordResetEmail({
      to: 'ana@example.com',
      name: 'Ana',
      resetUrl: 'http://localhost:5173/reset-password?token=xyz',
    });
    expect(msg.text).toContain('xyz');
    expect(msg.html).toContain('xyz');
  });

  it('accountDeletedEmail se renderiza con datos de ejemplo sin lanzar error', () => {
    const msg = accountDeletedEmail({ to: 'ana@example.com', name: 'Ana' });
    expect(msg.to).toBe('ana@example.com');
    expect(msg.subject).toBe('Tu cuenta ha sido eliminada');
    expect(msg.text).toContain('Ana');
    expect(msg.html).toContain('eliminado');
  });
});
