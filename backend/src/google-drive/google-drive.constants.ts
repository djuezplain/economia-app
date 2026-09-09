/**
 * Spec 032 H4, plan.md §9.5/§9.7: scope más restrictivo de Drive — la app
 * solo puede ver/gestionar los ficheros que ella misma crea, nunca el resto
 * del Drive del usuario (spec.md H4 criterio 3).
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Carpeta propia de la app dentro del Drive del usuario (spec.md H4 criterio 4). */
export const DRIVE_FOLDER_NAME = 'Economía App';

/** Vida corta del JWT de `state` (plan.md §9.5) — solo dura lo que tarda el usuario en pasar por el consentimiento de Google. */
export const DRIVE_CONNECT_STATE_TTL = '5m';

/** Plan.md §9.7 — endpoints de la API de Drive usados por `ensureFolder`/`uploadJson`. */
export const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
