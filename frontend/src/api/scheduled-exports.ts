import { api } from './client';

// Spec 032 H5. Espejo de `ScheduledExportRow`/`SaveScheduledExportDto` (backend, `scheduled-exports/`).
export type ScheduleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ScheduleDestination = 'LOCAL' | 'DRIVE';

export interface ScheduledExportConfig {
  id: string;
  userId: string;
  enabled: boolean;
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  destination: ScheduleDestination;
  localSubfolder: string | null;
  lastRunAt: string | null;
  lastRunError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveScheduledExportInput {
  enabled: boolean;
  frequency: ScheduleFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  destination: ScheduleDestination;
  localSubfolder?: string;
}

/** `null` si nunca se ha configurado (H5 plan.md §11.6). */
export function getScheduledExport(): Promise<ScheduledExportConfig | null> {
  return api.get<ScheduledExportConfig | null>('/scheduled-exports');
}

export function saveScheduledExport(input: SaveScheduledExportInput): Promise<ScheduledExportConfig> {
  return api.put<ScheduledExportConfig>('/scheduled-exports', input);
}

/** H5 criterio 4: desactiva sin borrar la configuración. */
export function disableScheduledExport(): Promise<void> {
  return api.delete<void>('/scheduled-exports');
}
