import { api, API_BASE_URL } from './client';

// H3 (spec 001): navegación completa del navegador a Google, no una llamada
// fetch — por eso es una URL para usar en un <a href>, no una función de api/auth.ts.
export const GOOGLE_LOGIN_URL = `${API_BASE_URL}/auth/google`;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface MessageResponse {
  message: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
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

export function forgotPassword(email: string): Promise<MessageResponse> {
  return api.post<MessageResponse>('/auth/forgot-password', { email });
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export function resetPassword(input: ResetPasswordInput): Promise<MessageResponse> {
  return api.post<MessageResponse>('/auth/reset-password', input);
}

export function login(input: LoginInput): Promise<LoginResponse> {
  // skipAuthRetry: un 401 aquí es "credenciales incorrectas", no un access
  // token caducado — no tiene sentido intentar refrescarlo.
  return api.post<LoginResponse>('/auth/login', input, { skipAuthRetry: true });
}

export function refresh(): Promise<RefreshResponse> {
  // Igual que login: si el refresh token ya no vale, reintentar refrescar no
  // tiene sentido (evita además un bucle contra sí mismo).
  return api.post<RefreshResponse>('/auth/refresh', undefined, { skipAuthRetry: true });
}

export function logout(): Promise<MessageResponse> {
  return api.post<MessageResponse>('/auth/logout');
}
