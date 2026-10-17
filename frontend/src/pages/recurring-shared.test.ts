import { describe, expect, it } from 'vitest';
import { describeRecurrence } from './recurring-shared';

describe('describeRecurrence', () => {
  it('mensual: día del mes', () => {
    expect(describeRecurrence('MONTHLY', '2026-01-05')).toBe('Cada mes, el día 5');
    expect(describeRecurrence('MONTHLY', '2026-01-31')).toBe('Cada mes, el día 31');
  });
  it('anual: día y mes', () => {
    expect(describeRecurrence('YEARLY', '2026-03-10')).toBe('Cada año, el 10 de marzo');
    expect(describeRecurrence('YEARLY', '2024-12-01')).toBe('Cada año, el 1 de diciembre');
  });
});
