import type { Category } from '../api/categories';
import type { PaymentMethod } from '../api/transactions';

// Spec 006 (páginas de movimientos), plan.md §4. Utilidades compartidas por
// `MovementsListPage`, `MovementsSummaryPage` y `RegisterMovementPage`,
// movidas tal cual desde `MovementsPage.tsx` (spec 002) — sin cambiar su
// comportamiento, solo su ubicación.

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: 'Tarjeta',
  DIRECT_DEBIT: 'Recibo',
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyForm() {
  return {
    date: todayIso(),
    categoryId: '',
    subcategoryId: '',
    concept: '',
    merchant: '',
    amount: '',
    paymentMethod: '' as PaymentMethod | '',
  };
}

/** Resuelve un id de categoría a su nombre; si no se conoce (todavía cargando,
 *  o de algún motivo no está en la lista), muestra el propio id en vez de nada. */
export function categoryName(categories: Category[] | null, id: string): string {
  return categories?.find((c) => c.id === id)?.name ?? id;
}
