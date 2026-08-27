/**
 * Almacena el access token únicamente en memoria (variable de módulo), nunca
 * en localStorage/sessionStorage: decisión explícita del grupo 3 (tasks.md
 * T3.5) para reducir el riesgo de robo del token vía XSS. Se pierde al
 * recargar la página a propósito — `AuthProvider` lo restaura llamando a
 * `POST /auth/refresh`, que se apoya en la cookie httpOnly del refresh token
 * (esa sí sobrevive al reload, y JS no puede leerla).
 */
let currentAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}
