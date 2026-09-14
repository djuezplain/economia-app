import Joi from 'joi';

/**
 * Esquema de validación de variables de entorno.
 * Si falta o es inválida alguna variable requerida, Nest falla al arrancar
 * con un mensaje claro en vez de fallar más tarde en tiempo de ejecución.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
  GOOGLE_CALLBACK_URL: Joi.string().uri().default('http://localhost:3000/auth/google/callback'),
  GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: Joi.string().allow('').default(''),
  GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY: Joi.string().allow('').default(''),
  GOOGLE_DRIVE_CALLBACK_URL: Joi.string().uri().default('http://localhost:3000/auth/drive/callback'),
  DRIVE_TOKEN_ENCRYPTION_KEY: Joi.string().allow('').default(''),
  GOOGLE_CLOUD_VISION_API_KEY: Joi.string().allow('').default(''),
  // Spec 032 H5, plan.md §11.2: directorio base para las exportaciones
  // programadas con destino "carpeta en el servidor" — cada usuario
  // escribe en su propia subcarpeta (`<dir>/<userId>/...`), nunca fuera de
  // aquí. En producción, volumen de Docker (mismo criterio que `backups/`
  // de `deploy/backup.sh`).
  SCHEDULED_EXPORT_LOCAL_DIR: Joi.string().default('./scheduled-exports'),
  MAIL_FROM: Joi.string().email().required(),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
});
