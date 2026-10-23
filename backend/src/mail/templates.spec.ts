import { describe, expect, it } from 'vitest';
import { accountDeletedEmail, alreadyRegisteredEmail, passwordResetEmail, recurringRemindersEmail, verificationEmail } from './templates.js';

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

describe('recurringRemindersEmail (spec 049 H1)', () => {
  const base = {
    to: 'ana@example.com',
    name: 'Ana',
    recurringUrl: 'http://localhost:5173/recurring',
    profileUrl: 'http://localhost:5173/profile',
  };

  it('lista cada recibo con fecha, concepto e importe, y enlaza a Recurrentes y al perfil', () => {
    const msg = recurringRemindersEmail({
      ...base,
      items: [
        { date: '26 de octubre', concept: 'Seguro hogar', amount: '30,00 €', estimated: false, isIncome: false },
        { date: '28 de octubre', concept: 'Nómina', amount: '2.000,00 €', estimated: false, isIncome: true },
      ],
    });
    expect(msg.subject).toBe('Próximos recibos (2)');
    expect(msg.text).toContain('- 26 de octubre: Seguro hogar, −30,00 €');
    expect(msg.text).toContain('- 28 de octubre: Nómina, +2.000,00 €');
    for (const body of [msg.text, msg.html]) {
      expect(body).toContain('http://localhost:5173/recurring');
      expect(body).toContain('http://localhost:5173/profile');
    }
    expect(msg.text).not.toContain('estimación');
  });

  it('un solo recibo lleva su concepto en el asunto', () => {
    const msg = recurringRemindersEmail({
      ...base,
      items: [{ date: '26 de octubre', concept: 'Seguro hogar', amount: '30,00 €', estimated: false, isIncome: false }],
    });
    expect(msg.subject).toBe('Próximo recibo: Seguro hogar');
  });

  it('marca los importes estimados con "≈" y lo explica', () => {
    const msg = recurringRemindersEmail({
      ...base,
      items: [{ date: '26 de octubre', concept: 'Luz', amount: '64,20 €', estimated: true, isIncome: false }],
    });
    expect(msg.text).toContain('≈ −64,20 €');
    expect(msg.html).toContain('≈ −64,20 €');
    expect(msg.text).toContain('estimación');
  });

  it('escapa el HTML de los conceptos escritos por el usuario', () => {
    const msg = recurringRemindersEmail({
      ...base,
      items: [{ date: '26 de octubre', concept: '<img src=x onerror=alert(1)>', amount: '1,00 €', estimated: false, isIncome: false }],
    });
    expect(msg.html).not.toContain('<img');
    expect(msg.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
