import { api } from './client';

export type MovementType = 'INCOME' | 'EXPENSE';

// H3 (spec 002). Espejo de `Category` en el backend (`categories.service.ts`).
export interface Category {
  id: string;
  userId: string;
  type: MovementType;
  name: string;
  parentId: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateCategoryInput {
  type: MovementType;
  name: string;
  parentId?: string;
}

export function listCategories(type?: MovementType): Promise<Category[]> {
  return api.get<Category[]>(type ? `/categories?type=${type}` : '/categories');
}

export function createCategory(input: CreateCategoryInput): Promise<Category> {
  return api.post<Category>('/categories', input);
}

export function renameCategory(id: string, name: string): Promise<Category> {
  return api.patch<Category>(`/categories/${id}`, { name });
}

export function deleteCategory(id: string): Promise<void> {
  return api.delete<void>(`/categories/${id}`);
}
