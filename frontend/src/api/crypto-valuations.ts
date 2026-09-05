import { api } from './client';

// H3 (spec 022). Espejo de `CryptoValuation` en el backend (`crypto-valuations.service.ts`).
export interface CryptoValuation {
  id: string;
  cryptoId: string;
  pricePerUnit: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCryptoValuationInput {
  cryptoId: string;
  pricePerUnit: string;
  date: string;
}

export interface UpdateCryptoValuationInput {
  pricePerUnit?: string;
  date?: string;
}

export function listCryptoValuations(): Promise<CryptoValuation[]> {
  return api.get<CryptoValuation[]>('/crypto-valuations');
}

export function createCryptoValuation(input: CreateCryptoValuationInput): Promise<CryptoValuation> {
  return api.post<CryptoValuation>('/crypto-valuations', input);
}

export function updateCryptoValuation(id: string, input: UpdateCryptoValuationInput): Promise<CryptoValuation> {
  return api.patch<CryptoValuation>(`/crypto-valuations/${id}`, input);
}

export function deleteCryptoValuation(id: string): Promise<void> {
  return api.delete<void>(`/crypto-valuations/${id}`);
}
