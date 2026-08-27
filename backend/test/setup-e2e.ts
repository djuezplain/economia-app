import { config } from 'dotenv';

// Los tests e2e usan su propia base de datos (economia_test), nunca la de
// desarrollo. `override: true` porque dotenv, por defecto, no pisa variables
// ya presentes en process.env — y en CI el workflow ya exporta DATABASE_URL
// apuntando a su Postgres de servicio, así que ahí este archivo no hace nada.
config({ path: '.env.test', override: false });
