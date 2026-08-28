import { useEffect, useState } from 'react';
import { listCategories } from '../api/categories';
import type { Category, MovementType } from '../api/categories';
import { useAuth } from '../auth/auth-context';
import { ApiError } from '../api/client';

export interface UseCategoriesForTypeResult {
  categories: Category[] | null;
  categoriesError: string | null;
}

/**
 * Spec 006 (páginas de movimientos), plan.md §4. Extrae, tal cual, el efecto
 * de carga de categorías que hoy vive dentro de `MovementsPage` — pensado
 * para que `MovementsListPage`, `MovementsSummaryPage` y `RegisterMovementPage`
 * no repitan el mismo `useEffect` tres veces, NO para compartir estado entre
 * ellas: cada llamada a este hook mantiene su propio `useState` — dos
 * componentes que lo usan a la vez no comparten categorías ni error, igual
 * que si el código estuviera copiado literalmente en los tres sitios
 * (spec.md H1 criterio 4: cada página es independiente).
 */
export function useCategoriesForType(type: MovementType): UseCategoriesForTypeResult {
  const { isAuthenticated } = useAuth();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listCategories(type);
        if (!cancelled) setCategories(list);
      } catch (err) {
        if (!cancelled) setCategoriesError(err instanceof ApiError ? err.message : 'No se han podido cargar las categorías.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, type]);

  return { categories, categoriesError };
}
