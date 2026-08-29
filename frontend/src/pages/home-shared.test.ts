import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, lastDayOfMonth } from './home-shared';

// `Intl.NumberFormat` separa la cifra del símbolo de moneda con un espacio
// de no separación (U+00A0), no un espacio normal — de ahí este helper en
// vez de escribir el carácter literal en cada expectativa.
function eur(n: string): string {
  return `${n} €`;
}

describe('formatCurrency', () => {
  it('formatea un importe con dos decimales, coma decimal y símbolo € al final', () => {
    expect(formatCurrency('648.20')).toBe(eur('648,20'));
  });

  it('formatea decimales de un solo dígito rellenando con un cero', () => {
    expect(formatCurrency('5.4')).toBe(eur('5,40'));
  });

  it('formatea negativos con el signo antes de la cifra', () => {
    expect(formatCurrency('-13.19')).toBe(eur('-13,19'));
  });

  it('formatea cero', () => {
    expect(formatCurrency('0.00')).toBe(eur('0,00'));
  });

  it('formatea importes enteros sin decimales en el string de entrada', () => {
    expect(formatCurrency('2100')).toBe(eur('2100,00'));
  });

  it('agrupa los miles a partir de 5 cifras enteras', () => {
    expect(formatCurrency('12345.6')).toBe(eur('12.345,60'));
  });
});

describe('formatDate', () => {
  it('formatea día y mes abreviado en español', () => {
    expect(formatDate('2026-08-26')).toBe('26 ago');
  });

  it('no añade cero delante del día', () => {
    expect(formatDate('2026-01-05')).toBe('5 ene');
  });

  it('resuelve diciembre correctamente (índice de mes 12)', () => {
    expect(formatDate('2026-12-31')).toBe('31 dic');
  });
});

describe('lastDayOfMonth', () => {
  it('resuelve un mes de 31 días', () => {
    expect(lastDayOfMonth('2026-08')).toBe(31);
  });

  it('resuelve un mes de 30 días', () => {
    expect(lastDayOfMonth('2026-04')).toBe(30);
  });

  it('resuelve febrero en año no bisiesto', () => {
    expect(lastDayOfMonth('2026-02')).toBe(28);
  });

  it('resuelve febrero en año bisiesto', () => {
    expect(lastDayOfMonth('2028-02')).toBe(29);
  });
});
