import { api } from './client';

// H2 (spec 024). Espejo de `PensionPlanContribution` en el backend (`pension-plan-contributions.service.ts`).
export interface PensionPlanContribution {
  id: string;
  pensionPlanId: string;
  amount: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePensionPlanContributionInput {
  pensionPlanId: string;
  amount: string;
  date: string;
}

export interface UpdatePensionPlanContributionInput {
  amount?: string;
  date?: string;
}

export function listPensionPlanContributions(): Promise<PensionPlanContribution[]> {
  return api.get<PensionPlanContribution[]>('/pension-plan-contributions');
}

export function createPensionPlanContribution(input: CreatePensionPlanContributionInput): Promise<PensionPlanContribution> {
  return api.post<PensionPlanContribution>('/pension-plan-contributions', input);
}

export function updatePensionPlanContribution(id: string, input: UpdatePensionPlanContributionInput): Promise<PensionPlanContribution> {
  return api.patch<PensionPlanContribution>(`/pension-plan-contributions/${id}`, input);
}

export function deletePensionPlanContribution(id: string): Promise<void> {
  return api.delete<void>(`/pension-plan-contributions/${id}`);
}
