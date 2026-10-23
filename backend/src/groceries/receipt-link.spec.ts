import { describe, expect, it } from 'vitest';
import { merchantSimilarity, rankLinkCandidates } from './receipt-link.js';
import type { LinkCandidate, ReceiptForLink } from './receipt-link.js';

// Spec 048 H3 criterio 1 / plan.md §2.
describe('merchantSimilarity', () => {
  it('ignora mayúsculas, tildes, signos y palabras de relleno', () => {
    expect(merchantSimilarity('MERCADONA, S.A.', 'Mercadona Valencia')).toBe(1);
    expect(merchantSimilarity('Farmacia Pérez', 'FARMACIA PEREZ SL')).toBe(1);
  });

  it('acepta un nombre recortado por el banco (prefijo de 4 letras o más)', () => {
    expect(merchantSimilarity('MERCADONA', 'COMPRA TARJ. MERCADON')).toBe(1);
  });

  it('no inventa parecido entre comercios distintos', () => {
    expect(merchantSimilarity('MERCADONA, S.A.', 'IBERDROLA CLIENTES')).toBe(0);
    expect(merchantSimilarity('LIDL', 'LID')).toBe(0); // prefijo de menos de 4 letras
  });

  it('da un parecido parcial si solo coincide parte del nombre', () => {
    expect(merchantSimilarity('El Corte Inglés Nuevo Centro', 'CORTE INGLES')).toBe(1);
    expect(merchantSimilarity('Casa Paco Bar', 'Bar Manolo Casa')).toBeCloseTo(2 / 3);
  });

  it('con un texto vacío o solo de relleno devuelve 0', () => {
    expect(merchantSimilarity('', 'Mercadona')).toBe(0);
    expect(merchantSimilarity('S.A.', 'Mercadona')).toBe(0);
    expect(merchantSimilarity('Mercadona', null)).toBe(0);
  });
});

function movement(overrides: Partial<LinkCandidate>): LinkCandidate {
  return { id: 'm', type: 'EXPENSE', date: '2026-10-15', amount: '39.27', merchant: null, concept: 'Compra', ...overrides };
}

const RECEIPT: ReceiptForLink = { date: '2026-10-15', printedTotal: '39.27', linesTotal: '38.90', merchantName: 'MERCADONA, S.A.' };

describe('rankLinkCandidates', () => {
  it('casa por el total impreso o por la suma de líneas', () => {
    const porTotal = movement({ id: 'total', amount: '39.27' });
    const porLineas = movement({ id: 'lineas', amount: '38.90' });
    const otro = movement({ id: 'otro', amount: '40.00' });
    expect(rankLinkCandidates(RECEIPT, [porTotal, porLineas, otro]).map((m) => m.id).sort()).toEqual(['lineas', 'total']);
  });

  it('sin líneas ni total impreso no hay candidatos', () => {
    expect(rankLinkCandidates({ ...RECEIPT, printedTotal: null, linesTotal: null }, [movement({})])).toEqual([]);
  });

  it('ventana: desde 2 días antes hasta 5 después de la fecha del ticket', () => {
    const ids = rankLinkCandidates(RECEIPT, [
      movement({ id: '-3', date: '2026-10-12' }),
      movement({ id: '-2', date: '2026-10-13' }),
      movement({ id: '+5', date: '2026-10-20' }),
      movement({ id: '+6', date: '2026-10-21' }),
    ]).map((m) => m.id);
    expect(ids.sort()).toEqual(['+5', '-2']);
  });

  it('la ventana cruza bien el fin de mes y de año', () => {
    const ids = rankLinkCandidates({ ...RECEIPT, date: '2026-12-30' }, [
      movement({ id: 'dentro', date: '2027-01-04' }),
      movement({ id: 'fuera', date: '2027-01-05' }),
    ]).map((m) => m.id);
    expect(ids).toEqual(['dentro']);
  });

  it('excluye los ingresos', () => {
    expect(rankLinkCandidates(RECEIPT, [movement({ type: 'INCOME' })])).toEqual([]);
  });

  it('ordena por parecido del comercio (comercio o concepto) y luego por cercanía de fecha', () => {
    const ids = rankLinkCandidates(RECEIPT, [
      movement({ id: 'otro-comercio-mismo-dia', merchant: 'CARREFOUR', date: '2026-10-15' }),
      movement({ id: 'mercadona-lejos', merchant: 'MERCADONA', date: '2026-10-19' }),
      movement({ id: 'mercadona-en-concepto-cerca', concept: 'COMPRA MERCADONA VALENCIA', date: '2026-10-16' }),
    ]).map((m) => m.id);
    expect(ids).toEqual(['mercadona-en-concepto-cerca', 'mercadona-lejos', 'otro-comercio-mismo-dia']);
  });
});
