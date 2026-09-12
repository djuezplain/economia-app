import { BadRequestException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import type { products, supermarkets } from '../db/schema/index.js';
import type { EntityRefDto } from './dto/confirm-receipt.dto.js';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
type RefTable = typeof supermarkets | typeof products;

/**
 * Spec 034 plan.md §8-§9 / spec 035 plan.md §2: `{ id }` existente
 * (verificado que pertenece al usuario) o `{ name }` nuevo. Extraída de
 * `ReceiptImportService` para que `ReceiptsService.update()` (spec 035,
 * H2-H3) la reutilice sin duplicar la lógica ni depender un módulo del
 * otro — se importa la función, no el módulo.
 */
export async function resolveEntityRef(
  tx: Executor,
  table: RefTable,
  userId: string,
  ref: EntityRefDto,
  notFoundMessage: string,
): Promise<string> {
  const t = table as typeof supermarkets;
  if (ref.id) {
    const [row] = await tx.select({ id: t.id }).from(t).where(and(eq(t.id, ref.id), eq(t.userId, userId)));
    if (!row) throw new NotFoundException(notFoundMessage);
    return row.id;
  }
  if (ref.name) {
    const [created] = await tx.insert(t).values({ userId, name: ref.name }).returning({ id: t.id });
    return created.id;
  }
  throw new BadRequestException('Falta el id o el nombre de la entidad indicada.');
}
