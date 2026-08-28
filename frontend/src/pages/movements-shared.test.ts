import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { categoryName, emptyForm, PAYMENT_METHOD_LABELS, todayIso } from './movements-shared';
import type { Category } from '../api/categories';

const CATEGORY: Category = {
  id: 'cat-1',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Ocio',
  parentId: null,
  isDefault: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('movements-shared', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('todayIso devuelve la fecha de hoy en formato YYYY-MM-DD', () => {
    expect(todayIso()).toBe('2026-08-15');
  });

  it('emptyForm devuelve un formulario vacío con la fecha de hoy', () => {
    expect(emptyForm()).toEqual({
      date: '2026-08-15',
      categoryId: '',
      subcategoryId: '',
      concept: '',
      merchant: '',
      amount: '',
      paymentMethod: '',
    });
  });

  it('categoryName devuelve el nombre si la categoría está en la lista', () => {
    expect(categoryName([CATEGORY], 'cat-1')).toBe('Ocio');
  });

  it('categoryName devuelve el propio id si la categoría no está en la lista (todavía cargando, o desconocida)', () => {
    expect(categoryName([CATEGORY], 'cat-ajena')).toBe('cat-ajena');
    expect(categoryName(null, 'cat-1')).toBe('cat-1');
  });

  it('PAYMENT_METHOD_LABELS cubre los 4 tipos de pago', () => {
    expect(PAYMENT_METHOD_LABELS).toEqual({
      CARD: 'Tarjeta',
      DIRECT_DEBIT: 'Recibo',
      CASH: 'Efectivo',
      TRANSFER: 'Transferencia',
    });
  });
});
