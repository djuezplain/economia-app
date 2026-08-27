import { api } from './client';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface MessageResponse {
  message: string;
}

export function register(input: RegisterInput): Promise<MessageResponse> {
  return api.post<MessageResponse>('/auth/register', input);
}

export function verifyEmail(token: string): Promise<MessageResponse> {
  return api.get<MessageResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export function resendVerification(email: string): Promise<MessageResponse> {
  return api.post<MessageResponse>('/auth/resend-verification', { email });
}
