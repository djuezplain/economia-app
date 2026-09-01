import type { CachedTransaction } from './db';
import type { ListTransactionsFilters, ListTransactionsResult } from '../api/transactions';
import { average, distinctMonthsCount, groupByCategory, groupBySubcategory, sumAmounts } from './calculations';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Spec 011 (modo offline), plan.md §4/§7. Reproduce, sobre la copia local
 * (IndexedDB), los mismos filtros que `TransactionsService.list` aplica en
 * el backend (`transactions.service.ts`) — para que `MovementsListPage`/
 * `MovementsSummaryPage` muestren offline el mismo resultado que verían
 * online con esos filtros.
 */
export function filterCachedTransactions(
  all: CachedTransaction[],
  filters: ListTransactionsFilters,
): CachedTransaction[] {
  return all
    .filter((t) => {
      if (filters.type && t.type !== filters.type) return false;
      if (filters.dateFrom && t.date < filters.dateFrom) return false;
      if (filters.dateTo && t.date > filters.dateTo) return false;
      if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
      if (filters.subcategoryId && t.subcategoryId !== filters.subcategoryId) return false;
      if (filters.merchant && !(t.merchant ?? '').toLowerCase().includes(filters.merchant.toLowerCase())) return false;
      if (filters.q && !t.concept.toLowerCase().includes(filters.q.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

/** Mismo cálculo de `summary` que `TransactionsService.list` (`plan.md` §7, `offline/calculations.ts`). */
export function buildOfflineListResult(
  all: CachedTransaction[],
  filters: ListTransactionsFilters,
): ListTransactionsResult {
  const matching = filterCachedTransactions(all, filters);
  const page = filters.page ?? 1;
  const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
  const items = matching.slice((page - 1) * limit, (page - 1) * limit + limit);
  const total = sumAmounts(matching);
  const months = distinctMonthsCount(matching.map((t) => t.date));

  return {
    items,
    page,
    limit,
    totalItems: matching.length,
    summary: {
      total,
      averagePerMonth: matching.length > 0 ? average(total, months) : null,
      byCategory: groupByCategory(matching),
      bySubcategory: groupBySubcategory(matching),
    },
  };
}
