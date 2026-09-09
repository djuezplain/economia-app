import { api, API_BASE_URL } from './client';

// Spec 032 H4. Espejo de las rutas de `backend/src/google-drive/`.
export interface DriveConnectionStatus {
  connected: boolean;
}

export interface DriveExportResult {
  fileId: string;
  webViewLink: string;
}

export function getDriveConnectionStatus(): Promise<DriveConnectionStatus> {
  return api.get<DriveConnectionStatus>('/drive/connection');
}

export function disconnectDrive(): Promise<void> {
  return api.delete<void>('/drive/connection');
}

export function exportToDrive(): Promise<DriveExportResult> {
  return api.post<DriveExportResult>('/drive/export');
}

/**
 * No es una llamada `fetch` — `GET /auth/drive/connect` redirige a Google
 * (plan.md §9.5), así que hace falta una navegación completa del navegador
 * (`window.location.href = driveConnectUrl()`), no `api.get`.
 */
export function driveConnectUrl(): string {
  return `${API_BASE_URL}/auth/drive/connect`;
}
