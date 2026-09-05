import { api } from './client';

// H1 (spec 022). Espejo de `Crypto` en el backend (`cryptos.service.ts`).
export interface Crypto {
  id: string;
  userId: string;
  exchange: string;
  crypto: string;
  createdAt: string;
  updatedAt: string;
}

export interface CryptoInput {
  exchange: string;
  crypto: string;
}

export function listCryptos(): Promise<Crypto[]> {
  return api.get<Crypto[]>('/cryptos');
}

export function createCrypto(input: CryptoInput): Promise<Crypto> {
  return api.post<Crypto>('/cryptos', input);
}

export function updateCrypto(id: string, input: Partial<CryptoInput>): Promise<Crypto> {
  return api.patch<Crypto>(`/cryptos/${id}`, input);
}

export function deleteCrypto(id: string): Promise<void> {
  return api.delete<void>(`/cryptos/${id}`);
}
