import { api } from './client';

// H1 (spec 024). Espejo de `PensionPlan` en el backend (`pension-plans.service.ts`).
export interface PensionPlan {
  id: string;
  userId: string;
  managingEntity: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface PensionPlanInput {
  managingEntity: string;
  plan: string;
}

export function listPensionPlans(): Promise<PensionPlan[]> {
  return api.get<PensionPlan[]>('/pension-plans');
}

export function createPensionPlan(input: PensionPlanInput): Promise<PensionPlan> {
  return api.post<PensionPlan>('/pension-plans', input);
}

export function updatePensionPlan(id: string, input: Partial<PensionPlanInput>): Promise<PensionPlan> {
  return api.patch<PensionPlan>(`/pension-plans/${id}`, input);
}

export function deletePensionPlan(id: string): Promise<void> {
  return api.delete<void>(`/pension-plans/${id}`);
}
