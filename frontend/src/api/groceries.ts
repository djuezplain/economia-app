import { api } from './client';

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
}

export interface ReceiptSummary {
  id: string;
  date: string;
  supermarketId: string;
  supermarketName: string;
  printedTotal: string | null;
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

export function getProductPrices(productId: string): Promise<ProductPrice[]> {
  return api.get<ProductPrice[]>(`/products/${productId}/prices`);
}

export function listReceipts(): Promise<ReceiptSummary[]> {
  return api.get<ReceiptSummary[]>('/receipts');
}

export function getReceipt(id: string): Promise<ReceiptDetail> {
  return api.get<ReceiptDetail>(`/receipts/${id}`);
}
