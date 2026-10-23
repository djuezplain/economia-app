import { BadRequestException } from '@nestjs/common';
import type { Database } from '../db/db.module.js';
import { products } from '../db/schema/index.js';
import type { EntityRefDto } from './dto/confirm-receipt.dto.js';
import { resolveEntityRef } from './resolve-entity-ref.util.js';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Spec 048 H2 criterio 2 / plan.md §3.2: un ticket sin líneas solo tiene el
 * total impreso como importe, así que entonces es obligatorio. Misma regla
 * al importar (spec 034) y al editar (spec 035).
 */
export function assertReceiptHasAmount(dto: { lines: unknown[]; printedTotal?: string | null }): void {
  if (dto.lines.length === 0 && !dto.printedTotal) {
    throw new BadRequestException('Un ticket sin líneas necesita el total.');
  }
}

/** Spec 048 H2 criterio 4: el producto de una línea, o `null` si se guarda sin producto. */
export async function resolveLineProduct(tx: Executor, userId: string, ref: EntityRefDto | null): Promise<string | null> {
  if (ref === null) return null;
  return resolveEntityRef(tx, products, userId, ref, 'El producto indicado no existe.');
}
