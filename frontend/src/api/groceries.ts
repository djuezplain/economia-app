import { api } from './client';
import type { ConfirmReceiptPayload } from './receipt-import';

// Spec 034, plan.md §3 (grupo 5, lado de consulta).
export interface Supermarket {
  id: string;
  name: string;
}

/** Spec 042, plan.md §1: precio más bajo entre los precios más recientes de cada supermercado. */
export interface ProductLowestPrice {
  pricePerUnit: string;
  unit: string;
  supermarketId: string;
  supermarketName: string;
}

export interface Product {
  id: string;
  name: string;
  /** Spec 042, plan.md §2. Solo lo devuelve `searchProducts()` (listado); `null` sin ningún ticket. */
  lowestRecentPrice?: ProductLowestPrice | null;
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
  /** Spec 048 H1: el documento original (foto o PDF), o `null` si el ticket no tiene. */
  document: ReceiptDocumentInfo | null;
}

/** Spec 048 H1: metadatos del documento de un ticket (el contenido se pide aparte). */
export interface ReceiptDocumentInfo {
  id: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  originalFilename: string;
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

/** Spec 041, plan.md §1 (H1). */
export function createProduct(name: string): Promise<Product> {
  return api.post<Product>('/products', { name });
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

// --- Spec 048 H1: documento original de un ticket --------------------------

export function getReceiptDocument(receiptId: string): Promise<Blob> {
  return api.getBlob(`/receipts/${receiptId}/document`);
}

/** Adjunta un documento a un ticket guardado, o sustituye el que tenga. */
export function uploadReceiptDocument(receiptId: string, file: File): Promise<ReceiptDocumentInfo> {
  const formData = new FormData();
  formData.append('file', file);
  return api.putForm<ReceiptDocumentInfo>(`/receipts/${receiptId}/document`, formData);
}

export function deleteReceiptDocument(receiptId: string): Promise<void> {
  return api.delete<void>(`/receipts/${receiptId}/document`);
}
