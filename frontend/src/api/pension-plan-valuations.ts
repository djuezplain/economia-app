import { api } from './client';

// H3 (spec 024). Espejo de `PensionPlanValuation` en el backend (`pension-plan-valuations.service.ts`).
export interface PensionPlanValuation {
  id: string;
  pensionPlanId: string;
  value: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePensionPlanValuationInput {
  pensionPlanId: string;
  value: string;
  date: string;
}

export interface UpdatePensionPlanValuationInput {
  value?: string;
  date?: string;
}

export function listPensionPlanValuations(): Promise<PensionPlanValuation[]> {
  return api.get<PensionPlanValuation[]>('/pension-plan-valuations');
}

export function createPensionPlanValuation(input: CreatePensionPlanValuationInput): Promise<PensionPlanValuation> {
  return api.post<PensionPlanValuation>('/pension-plan-valuations', input);
}

export function updatePensionPlanValuation(id: string, input: UpdatePensionPlanValuationInput): Promise<PensionPlanValuation> {
  return api.patch<PensionPlanValuation>(`/pension-plan-valuations/${id}`, input);
}

export function deletePensionPlanValuation(id: string): Promise<void> {
  return api.delete<void>(`/pension-plan-valuations/${id}`);
}
