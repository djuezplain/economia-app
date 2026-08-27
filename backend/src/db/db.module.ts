import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export const DB = Symbol('DB');
export type Database = NodePgDatabase<typeof schema>;

/**
 * DbModule es @Global(): cualquier módulo de la app puede inyectar `DB`
 * sin tener que importar DbModule explícitamente en cada feature module.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database => {
        const pool = new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
