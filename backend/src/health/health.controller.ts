import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async check() {
    // Verifica también la conexión a la base de datos, no solo que el proceso responde.
    await this.db.execute(sql`select 1`);
    return { status: 'ok', db: 'ok', timestamp: new Date().toISOString() };
  }
}
