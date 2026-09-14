import { api } from './client';

// Spec 039, plan.md §5.
export interface ShoppingListSummary {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
}

export interface ShoppingListItem {
  id: string;
  productId: string;
  productName: string;
}

export interface ShoppingListDetail {
  id: string;
  name: string;
  createdAt: string;
  items: ShoppingListItem[];
}

export function listShoppingLists(): Promise<ShoppingListSummary[]> {
  return api.get<ShoppingListSummary[]>('/shopping-lists');
}

export function createShoppingList(name: string): Promise<ShoppingListSummary> {
  return api.post<ShoppingListSummary>('/shopping-lists', { name });
}

export function getShoppingList(id: string): Promise<ShoppingListDetail> {
  return api.get<ShoppingListDetail>(`/shopping-lists/${id}`);
}

export function renameShoppingList(id: string, name: string): Promise<ShoppingListSummary> {
  return api.patch<ShoppingListSummary>(`/shopping-lists/${id}`, { name });
}

export function deleteShoppingList(id: string): Promise<void> {
  return api.delete<void>(`/shopping-lists/${id}`);
}

export function addShoppingListItem(shoppingListId: string, productId: string): Promise<ShoppingListItem> {
  return api.post<ShoppingListItem>(`/shopping-lists/${shoppingListId}/items`, { productId });
}

export function removeShoppingListItem(shoppingListId: string, itemId: string): Promise<void> {
  return api.delete<void>(`/shopping-lists/${shoppingListId}/items/${itemId}`);
}
