import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { supermarkets } from '../db/schema/index.js';

export type Supermarket = typeof supermarkets.$inferSelect;

/** plan.md §3: `GET /supermarkets`, para el desplegable de H3 criterio 2. */
@Injectable()
export class SupermarketsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<Supermarket[]> {
    return this.db.select().from(supermarkets).where(eq(supermarkets.userId, userId)).orderBy(asc(supermarkets.name));
  }
}
