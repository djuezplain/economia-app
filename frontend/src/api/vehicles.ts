import { api } from './client';

// H1 (spec 023). Espejo de `Vehicle` en el backend (`vehicles.service.ts`).
export interface Vehicle {
  id: string;
  userId: string;
  brandModel: string;
  plate: string;
  purchasePrice: string;
  purchaseDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleInput {
  brandModel: string;
  plate: string;
  purchasePrice: string;
  purchaseDate: string;
}

export function listVehicles(): Promise<Vehicle[]> {
  return api.get<Vehicle[]>('/vehicles');
}

export function createVehicle(input: VehicleInput): Promise<Vehicle> {
  return api.post<Vehicle>('/vehicles', input);
}

export function updateVehicle(id: string, input: Partial<VehicleInput>): Promise<Vehicle> {
  return api.patch<Vehicle>(`/vehicles/${id}`, input);
}

export function deleteVehicle(id: string): Promise<void> {
  return api.delete<void>(`/vehicles/${id}`);
}
