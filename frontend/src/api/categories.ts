import { api } from './client';
import { putCategories } from '../offline/db';

export type MovementType = 'INCOME' | 'EXPENSE';

// H3 (spec 002). Espejo de `Category` en el backend (`categories.service.ts`).
// `icon` es opcional en el tipo (no en la respuesta real: el backend siempre
// manda un valor resuelto, el guardado o uno inferido del nombre) para no
// forzar a añadirlo en cada fixture de test de páginas que no lo usan
// (Movimientos, Dashboard, Objetivos...) — solo `CategoriesPage` lo lee.
export interface Category {
  id: string;
  userId: string;
  type: MovementType;
  name: string;
  parentId: string | null;
  isDefault: boolean;
  icon?: string;
  createdAt: string;
}

export interface CreateCategoryInput {
  type: MovementType;
  name: string;
  parentId?: string;
  // Sin él, el backend infiere uno del nombre (ver `pages/category-icons.ts`).
  icon?: string;
}

export interface UpdateCategoryInput {
  name: string;
  // `undefined` = no tocar el icono actual; `''` = volver a automático
  // (el backend lo reinfiere del nombre en cada lectura).
  icon?: string;
}

// Spec 011 (modo offline), plan.md §4: escritura de paso hacia la caché
// local, igual que `listTransactions`/`getTransaction`
// (`api/transactions.ts`). Como aquí `type` es un filtro, no se sustituye
// toda la caché de categorías por esta respuesta parcial — solo se
// actualizan (upsert) las que vienen en ella.
export async function listCategories(type?: MovementType): Promise<Category[]> {
  const categoriesList = await api.get<Category[]>(type ? `/categories?type=${type}` : '/categories');
  void putCategories(categoriesList);
  return categoriesList;
}

export function createCategory(input: CreateCategoryInput): Promise<Category> {
  return api.post<Category>('/categories', input);
}

export function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  return api.patch<Category>(`/categories/${id}`, input);
}

export function deleteCategory(id: string): Promise<void> {
  return api.delete<void>(`/categories/${id}`);
}
