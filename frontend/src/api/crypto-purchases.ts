import { api } from './client';

// H2 (spec 022). Espejo de `CryptoPurchase` en el backend (`crypto-purchases.service.ts`).
export interface CryptoPurchase {
  id: string;
  cryptoId: string;
  quantity: string;
  purchasePrice: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCryptoPurchaseInput {
  cryptoId: string;
  quantity: string;
  purchasePrice: string;
  date: string;
}

export interface UpdateCryptoPurchaseInput {
  quantity?: string;
  purchasePrice?: string;
  date?: string;
}

export function listCryptoPurchases(): Promise<CryptoPurchase[]> {
  return api.get<CryptoPurchase[]>('/crypto-purchases');
}

export function createCryptoPurchase(input: CreateCryptoPurchaseInput): Promise<CryptoPurchase> {
  return api.post<CryptoPurchase>('/crypto-purchases', input);
}

export function updateCryptoPurchase(id: string, input: UpdateCryptoPurchaseInput): Promise<CryptoPurchase> {
  return api.patch<CryptoPurchase>(`/crypto-purchases/${id}`, input);
}

export function deleteCryptoPurchase(id: string): Promise<void> {
  return api.delete<void>(`/crypto-purchases/${id}`);
}
