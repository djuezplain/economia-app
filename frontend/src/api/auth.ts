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
