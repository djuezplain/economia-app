import { describe, expect, it } from 'vitest';
import {
  detectDate,
  detectPrintedTotal,
  extractProductLines,
  guessSupermarketName,
  matchByNormalizedName,
} from './receipt-import.parsing.js';

/**
 * Texto sintético, no el ticket real fotografiado por Diego (plan.md §14) —
 * reproduce los mismos patrones ya verificados en `spec.md` §1: cabecera,
 * línea simple con un importe, línea con dos importes (unitario + total),
 * línea por peso en dos líneas físicas, y una línea de TOTAL seguida de
 * ruido de después que no debe leerse como producto.
 */
const SAMPLE_RECEIPT_TEXT = `MERCADONA, S.A.
C/ JOSÉ GUTIÉRREZ SOLANA, 18
01/04/2026 16:10 OP:4331680
Descripción P. Unit Imp.(€)
1 CHOCOLATE CLASSIC 1,30
2 NACHOS 0,90 1,80
1 BANANA
0,600 kg 1,55 €/kg 1,05
línea de ruido sin ningún importe
TOTAL (€) 39,27
TARJETA BANCARIA 39,27
IVA BASE IMPONIBLE (€) CUOTA (€)`;

describe('extractProductLines', () => {
  it('parsea una línea simple con un solo importe (precio/unidad = importe/cantidad)', () => {
    const lines = extractProductLines(SAMPLE_RECEIPT_TEXT);
    const chocolate = lines.find((l) => l.description === 'CHOCOLATE CLASSIC');
    expect(chocolate).toBeDefined();
    expect(chocolate!.quantity.toString()).toBe('1');
    expect(chocolate!.unit).toBe('unidad');
    expect(chocolate!.pricePerUnit.toString()).toBe('1.3');
    expect(chocolate!.amount.toString()).toBe('1.3');
  });

  it('parsea una línea con dos importes (precio/unidad y subtotal) sin confundirlos', () => {
    const lines = extractProductLines(SAMPLE_RECEIPT_TEXT);
    const nachos = lines.find((l) => l.description === 'NACHOS');
    expect(nachos).toBeDefined();
    expect(nachos!.quantity.toString()).toBe('2');
    expect(nachos!.pricePerUnit.toString()).toBe('0.9');
    expect(nachos!.amount.toString()).toBe('1.8');
  });

  it('combina una línea por peso en dos líneas físicas', () => {
    const lines = extractProductLines(SAMPLE_RECEIPT_TEXT);
    const banana = lines.find((l) => l.description === 'BANANA');
    expect(banana).toBeDefined();
    expect(banana!.unit).toBe('kg');
    expect(banana!.quantity.toString()).toBe('0.6');
    expect(banana!.pricePerUnit.toString()).toBe('1.55');
    expect(banana!.amount.toString()).toBe('1.05');
  });

  it('descarta en silencio una línea sin ningún importe, sin lanzar error', () => {
    const lines = extractProductLines(SAMPLE_RECEIPT_TEXT);
    expect(lines.some((l) => l.description.includes('ruido'))).toBe(false);
  });

  it('no lee nada de después de la línea de TOTAL (evita leer "TARJETA BANCARIA" como producto)', () => {
    const lines = extractProductLines(SAMPLE_RECEIPT_TEXT);
    expect(lines.some((l) => l.description.includes('TARJETA'))).toBe(false);
    expect(lines).toHaveLength(3);
  });

  it('sin cabecera "Descripción" ni TOTAL, procesa todas las líneas del texto', () => {
    const lines = extractProductLines('1 AGUA 0,50\n2 PAN 0,60 1,20');
    expect(lines).toHaveLength(2);
  });
});

describe('detectDate', () => {
  it('detecta dd/mm/aaaa y lo convierte a ISO', () => {
    expect(detectDate(SAMPLE_RECEIPT_TEXT)).toBe('2026-04-01');
  });

  it('devuelve null si no hay ninguna fecha reconocible', () => {
    expect(detectDate('sin fecha aquí')).toBeNull();
  });
});

describe('detectPrintedTotal', () => {
  it('detecta el importe de la línea que contiene "TOTAL"', () => {
    expect(detectPrintedTotal(SAMPLE_RECEIPT_TEXT)).toBe('39.27');
  });

  it('devuelve null si no hay ninguna línea de TOTAL reconocible (spec.md §1: caso real observado)', () => {
    expect(detectPrintedTotal('AA Ml 321\nTARJETA BANCANA 321')).toBeNull();
  });
});

describe('guessSupermarketName', () => {
  it('sugiere la primera línea no vacía del ticket', () => {
    expect(guessSupermarketName(SAMPLE_RECEIPT_TEXT)).toBe('MERCADONA, S.A.');
  });

  it('devuelve null si el texto está vacío', () => {
    expect(guessSupermarketName('   \n  \n')).toBeNull();
  });
});

describe('matchByNormalizedName', () => {
  const candidates = [
    { id: 'id-1', name: 'Mercadona' },
    { id: 'id-2', name: 'Carrefour' },
  ];

  it('empareja por nombre normalizado (mayúsculas/tildes/espacios distintos)', () => {
    expect(matchByNormalizedName('  MERCADONA, S.A.'.replace(', S.A.', ''), candidates)).toEqual({ matchedId: 'id-1' });
    expect(matchByNormalizedName('mercadona', candidates)).toEqual({ matchedId: 'id-1' });
  });

  it('sin coincidencia, sugiere el nombre tal cual para crear uno nuevo', () => {
    expect(matchByNormalizedName('Lidl', candidates)).toEqual({ suggestedName: 'Lidl' });
  });

  it('sin candidatos, siempre sugiere crear uno nuevo', () => {
    expect(matchByNormalizedName('Lidl', [])).toEqual({ suggestedName: 'Lidl' });
  });
});
