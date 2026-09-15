import { api } from './client';
import type { ConfirmReceiptPayload } from './receipt-import';

// Spec 034, plan.md §3 (grupo 5, lado de consulta).
export interface Supermarket {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
}

export interface ProductPrice {
  receiptId: string;
  supermarketId: string;
  supermarketName: string;
  date: string;
  unit: string;
  pricePerUnit: string;
  amount: string;
}

export interface ReceiptSummary {
  id: string;
  date: string;
  supermarketId: string;
  supermarketName: string;
  printedTotal: string | null;
  /** Spec 040, plan.md §3: suma real de las líneas — el importe usado para filtrar, no `printedTotal` (puede ser `null`). */
  linesTotal: string;
}

/** Spec 040, plan.md §1 (H1): filtros de `GET /receipts`, todos opcionales y combinables. */
export interface ListReceiptsFilters {
  supermarketId?: string;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: string;
  amountMax?: string;
}

function buildReceiptsQuery(filters: ListReceiptsFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export interface ReceiptLineDetail {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  pricePerUnit: string;
  amount: string;
  productId: string;
  productName: string;
}

export interface ReceiptDetail extends ReceiptSummary {
  lines: ReceiptLineDetail[];
}

export function listSupermarkets(): Promise<Supermarket[]> {
  return api.get<Supermarket[]>('/supermarkets');
}

export function searchProducts(search?: string): Promise<Product[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return api.get<Product[]>(`/products${query}`);
}

/** Spec 036, plan.md §1 (H2). */
export function getProduct(id: string): Promise<Product> {
  return api.get<Product>(`/products/${id}`);
}

/** Spec 036, plan.md §1 (H3). */
export function updateProduct(id: string, name: string): Promise<Product> {
  return api.patch<Product>(`/products/${id}`, { name });
}

export function getProductPrices(productId: string): Promise<ProductPrice[]> {
  return api.get<ProductPrice[]>(`/products/${productId}/prices`);
}

/** Spec 038 (H1): fusiona `mergedIds` en `survivorId` — sus tickets pasan a contar como del superviviente y los demás se borran. */
export function mergeProducts(survivorId: string, mergedIds: string[]): Promise<Product> {
  return api.post<Product>('/products/merge', { survivorId, mergedIds });
}

export function listReceipts(filters: ListReceiptsFilters = {}): Promise<ReceiptSummary[]> {
  return api.get<ReceiptSummary[]>(`/receipts${buildReceiptsQuery(filters)}`);
}

export function getReceipt(id: string): Promise<ReceiptDetail> {
  return api.get<ReceiptDetail>(`/receipts/${id}`);
}

/** Spec 035, plan.md §1 (H2-H3): mismo cuerpo que `confirmReceiptImport`, reutilizado tal cual. */
export function updateReceipt(id: string, payload: ConfirmReceiptPayload): Promise<ReceiptDetail> {
  return api.put<ReceiptDetail>(`/receipts/${id}`, payload);
}

/** Spec 035, plan.md §4 (H1). */
export function deleteReceipt(id: string): Promise<void> {
  return api.delete<void>(`/receipts/${id}`);
}
