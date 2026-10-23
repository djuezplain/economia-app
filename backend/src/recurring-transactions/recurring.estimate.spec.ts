import { estimateAmount } from './recurring.estimate.js';

// Spec 049 H2 criterio 2 / plan.md §2: media de las 3 últimas ocurrencias
// resueltas (más reciente primero); con menos, de las que haya; sin ninguna,
// el importe inicial de la plantilla.
describe('estimateAmount', () => {
  it('sin ocurrencias resueltas devuelve el importe inicial de la plantilla', () => {
    expect(estimateAmount('55.00', [])).toBe('55.00');
  });

  it('con una sola ocurrencia devuelve su importe, no la media con el inicial', () => {
    expect(estimateAmount('55.00', ['61.30'])).toBe('61.30');
  });

  it('con dos ocurrencias devuelve su media', () => {
    expect(estimateAmount('55.00', ['60.00', '70.00'])).toBe('65.00');
  });

  it('con tres ocurrencias devuelve su media', () => {
    expect(estimateAmount('55.00', ['60.00', '70.00', '80.00'])).toBe('70.00');
  });

  it('con más de tres solo cuentan las tres primeras (las más recientes)', () => {
    expect(estimateAmount('55.00', ['60.00', '70.00', '80.00', '1000.00'])).toBe('70.00');
  });

  it('redondea a 2 decimales una media periódica', () => {
    // 30.01 / 3 = 10.00333…
    expect(estimateAmount('0.00', ['10.00', '10.00', '10.01'])).toBe('10.00');
  });

  it('redondea medio céntimo hacia arriba (ROUND_HALF_UP)', () => {
    // 20.01 / 2 = 10.005
    expect(estimateAmount('0.00', ['10.00', '10.01'])).toBe('10.01');
  });

  it('no pierde precisión con importes que en coma flotante no son exactos', () => {
    // 0.1 + 0.2 + 0.3 en float es 0.6000000000000001
    expect(estimateAmount('0.00', ['0.10', '0.20', '0.30'])).toBe('0.20');
  });
});
