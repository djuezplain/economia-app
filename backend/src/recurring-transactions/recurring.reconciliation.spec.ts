import { dismissalKey, isCandidate, matchOccurrences } from './recurring.reconciliation.js';
import type { ExpectedOccurrence, MovementLike } from './recurring.reconciliation.js';

const CAT = 'cat-vivienda';
const OTHER_CAT = 'cat-ocio';

function occ(overrides: Partial<ExpectedOccurrence> = {}): ExpectedOccurrence {
  return {
    recurringId: 'rec-alquiler',
    date: '2026-10-01',
    type: 'EXPENSE',
    categoryId: CAT,
    expectedAmount: '800.00',
    variableAmount: false,
    ...overrides,
  };
}

function mov(overrides: Partial<MovementLike> = {}): MovementLike {
  return {
    id: 'mov-1',
    type: 'EXPENSE',
    categoryId: CAT,
    date: '2026-10-02',
    amount: '800.00',
    ...overrides,
  };
}

// Spec 049 H3 criterio 1 / plan.md §2.
describe('isCandidate', () => {
  it('casa con mismo tipo, categoría, fecha cercana e importe igual', () => {
    expect(isCandidate(occ(), mov())).toBe(true);
  });

  it('acepta hasta 5 días antes o después (incluidos) y rechaza a 6', () => {
    expect(isCandidate(occ(), mov({ date: '2026-09-26' }))).toBe(true);
    expect(isCandidate(occ(), mov({ date: '2026-10-06' }))).toBe(true);
    expect(isCandidate(occ(), mov({ date: '2026-09-25' }))).toBe(false);
    expect(isCandidate(occ(), mov({ date: '2026-10-07' }))).toBe(false);
  });

  it('cuenta bien los días al cruzar fin de mes y de año', () => {
    expect(isCandidate(occ({ date: '2026-12-30' }), mov({ date: '2027-01-04' }))).toBe(true);
    expect(isCandidate(occ({ date: '2026-12-30' }), mov({ date: '2027-01-05' }))).toBe(false);
    expect(isCandidate(occ({ date: '2026-03-01' }), mov({ date: '2026-02-24' }))).toBe(true);
    expect(isCandidate(occ({ date: '2026-03-01' }), mov({ date: '2026-02-23' }))).toBe(false);
  });

  it('en plantilla fija exige el importe exacto (un céntimo de diferencia no casa)', () => {
    expect(isCandidate(occ(), mov({ amount: '800.01' }))).toBe(false);
    expect(isCandidate(occ(), mov({ amount: '799.99' }))).toBe(false);
  });

  it('en plantilla variable acepta hasta un 40 % de desviación, ambos bordes incluidos', () => {
    const variable = occ({ variableAmount: true, expectedAmount: '50.00' });
    expect(isCandidate(variable, mov({ amount: '70.00' }))).toBe(true);
    expect(isCandidate(variable, mov({ amount: '30.00' }))).toBe(true);
    expect(isCandidate(variable, mov({ amount: '70.01' }))).toBe(false);
    expect(isCandidate(variable, mov({ amount: '29.99' }))).toBe(false);
  });

  it('no casa con otro tipo ni con otra categoría', () => {
    expect(isCandidate(occ(), mov({ type: 'INCOME' }))).toBe(false);
    expect(isCandidate(occ(), mov({ categoryId: OTHER_CAT }))).toBe(false);
  });
});

describe('matchOccurrences', () => {
  it('un único candidato que solo encaja con esa ocurrencia → automático', () => {
    const result = matchOccurrences([occ()], [mov()], new Set());
    expect(result.automatic).toEqual([{ occurrence: occ(), movement: mov() }]);
    expect(result.ambiguous).toEqual([]);
  });

  it('sin candidatos no devuelve nada', () => {
    const result = matchOccurrences([occ()], [mov({ amount: '10.00' })], new Set());
    expect(result).toEqual({ automatic: [], ambiguous: [] });
  });

  it('dos movimientos para una ocurrencia → ambiguo, nunca automático', () => {
    const a = mov({ id: 'mov-a', date: '2026-10-02' });
    const b = mov({ id: 'mov-b', date: '2026-09-30' });
    const result = matchOccurrences([occ()], [a, b], new Set());
    expect(result.automatic).toEqual([]);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidates.map((c) => c.id).sort()).toEqual(['mov-a', 'mov-b']);
  });

  it('un movimiento que encaja con dos ocurrencias (de plantillas distintas) → ambiguo en ambas', () => {
    const seguroCoche = occ({ recurringId: 'rec-seguro-coche', expectedAmount: '300.00' });
    const seguroHogar = occ({ recurringId: 'rec-seguro-hogar', expectedAmount: '300.00' });
    const cargo = mov({ amount: '300.00' });
    const result = matchOccurrences([seguroCoche, seguroHogar], [cargo], new Set());
    expect(result.automatic).toEqual([]);
    expect(result.ambiguous.map((a) => a.occurrence.recurringId).sort()).toEqual(['rec-seguro-coche', 'rec-seguro-hogar']);
  });

  it('el conflicto de una pareja no impide que otra pareja independiente se concilie sola', () => {
    const luz = occ({ recurringId: 'rec-luz', categoryId: 'cat-suministros', expectedAmount: '60.00', variableAmount: true });
    const cargoLuz = mov({ id: 'mov-luz', categoryId: 'cat-suministros', amount: '64.20' });
    const a = mov({ id: 'mov-a' });
    const b = mov({ id: 'mov-b' });
    const result = matchOccurrences([occ(), luz], [a, b, cargoLuz], new Set());
    expect(result.automatic.map((p) => p.movement.id)).toEqual(['mov-luz']);
    expect(result.ambiguous.map((p) => p.occurrence.recurringId)).toEqual(['rec-alquiler']);
  });

  it('excluye los pares descartados', () => {
    const dismissed = new Set([dismissalKey('rec-alquiler', '2026-10-01', 'mov-1')]);
    expect(matchOccurrences([occ()], [mov()], dismissed)).toEqual({ automatic: [], ambiguous: [] });
  });

  it('descartar uno de dos candidatos deja al otro como automático', () => {
    const a = mov({ id: 'mov-a' });
    const b = mov({ id: 'mov-b' });
    const dismissed = new Set([dismissalKey('rec-alquiler', '2026-10-01', 'mov-a')]);
    const result = matchOccurrences([occ()], [a, b], dismissed);
    expect(result.automatic.map((p) => p.movement.id)).toEqual(['mov-b']);
  });

  it('ordena los candidatos ambiguos por cercanía de importe y luego de fecha', () => {
    const variable = occ({ variableAmount: true, expectedAmount: '60.00' });
    const lejosImporte = mov({ id: 'lejos-importe', amount: '75.00', date: '2026-10-01' });
    const cercaImporteLejosFecha = mov({ id: 'cerca-importe-lejos-fecha', amount: '61.00', date: '2026-10-05' });
    const cercaImporteCercaFecha = mov({ id: 'cerca-importe-cerca-fecha', amount: '59.00', date: '2026-10-02' });
    const result = matchOccurrences([variable], [lejosImporte, cercaImporteLejosFecha, cercaImporteCercaFecha], new Set());
    expect(result.ambiguous[0].candidates.map((c) => c.id)).toEqual([
      'cerca-importe-cerca-fecha',
      'cerca-importe-lejos-fecha',
      'lejos-importe',
    ]);
  });
});
