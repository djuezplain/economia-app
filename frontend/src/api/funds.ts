import { api } from './client';

// H1 (spec 021). Espejo de `Fund` en el backend (`funds.service.ts`).
export interface Fund {
  id: string;
  userId: string;
  custodyBank: string;
  fund: string;
  createdAt: string;
  updatedAt: string;
}

export interface FundInput {
  custodyBank: string;
  fund: string;
}

export function listFunds(): Promise<Fund[]> {
  return api.get<Fund[]>('/funds');
}

export function createFund(input: FundInput): Promise<Fund> {
  return api.post<Fund>('/funds', input);
}

export function updateFund(id: string, input: Partial<FundInput>): Promise<Fund> {
  return api.patch<Fund>(`/funds/${id}`, input);
}

export function deleteFund(id: string): Promise<void> {
  return api.delete<void>(`/funds/${id}`);
}
