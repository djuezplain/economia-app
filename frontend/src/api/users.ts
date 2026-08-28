import { api } from './client';

// H7 (spec 001). Espejo de `UserProfile` en el backend (`src/users/users.service.ts`).
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  currency: string;
  locale: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
  createdAt: string;
  // H8 (spec 001): decide qué pide el modal de borrado de cuenta — contraseña
  // o email de confirmación (ver DeleteAccountPayload).
  hasPassword: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  currency?: string;
  locale?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function getProfile(): Promise<UserProfile> {
  return api.get<UserProfile>('/users/me');
}

export function updateProfile(input: UpdateProfileInput): Promise<UserProfile> {
  return api.patch<UserProfile>('/users/me', input);
}

export interface MessageResponse {
  message: string;
}

export function changePassword(input: ChangePasswordInput): Promise<MessageResponse> {
  return api.post<MessageResponse>('/users/me/change-password', input);
}

// H8 (spec 001), criterio 1. Forma exacta del JSON del backend no importa
// mucho aquí más allá de "es un objeto serializable": se descarga tal cual.
export function exportAccountData(): Promise<Record<string, unknown>> {
  return api.get<Record<string, unknown>>('/users/me/export');
}

// H8, criterio 2: solo uno de los dos aplica según `UserProfile.hasPassword`.
export interface DeleteAccountPayload {
  password?: string;
  confirmEmail?: string;
}

export function deleteAccount(payload: DeleteAccountPayload): Promise<void> {
  return api.delete<void>('/users/me', payload);
}
