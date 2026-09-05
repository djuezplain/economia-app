import { api } from './client';

// H2 (spec 023). Espejo de `VehicleValuation` en el backend (`vehicle-valuations.service.ts`).
export interface VehicleValuation {
  id: string;
  vehicleId: string;
  value: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleValuationInput {
  vehicleId: string;
  value: string;
  date: string;
}

export interface UpdateVehicleValuationInput {
  value?: string;
  date?: string;
}

export function listVehicleValuations(): Promise<VehicleValuation[]> {
  return api.get<VehicleValuation[]>('/vehicle-valuations');
}

export function createVehicleValuation(input: CreateVehicleValuationInput): Promise<VehicleValuation> {
  return api.post<VehicleValuation>('/vehicle-valuations', input);
}

export function updateVehicleValuation(id: string, input: UpdateVehicleValuationInput): Promise<VehicleValuation> {
  return api.patch<VehicleValuation>(`/vehicle-valuations/${id}`, input);
}

export function deleteVehicleValuation(id: string): Promise<void> {
  return api.delete<void>(`/vehicle-valuations/${id}`);
}
