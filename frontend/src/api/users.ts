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
