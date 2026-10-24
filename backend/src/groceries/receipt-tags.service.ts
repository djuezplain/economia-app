import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { receiptTagLinks, receiptTags, receipts } from '../db/schema/index.js';
import type { ReceiptTagColor } from '../db/schema/index.js';
import { isUniqueViolation } from '../common/db-errors.util.js';
import { MAX_TAGS_PER_RECEIPT } from './dto/receipt-tag.dto.js';
import type { CreateReceiptTagDto, ReceiptTagsSelectionDto, UpdateReceiptTagDto } from './dto/receipt-tag.dto.js';

export interface ReceiptTag {
  id: string;
  name: string;
  color: ReceiptTagColor | null;
}

export interface ReceiptTagWithCount extends ReceiptTag {
  receiptCount: number;
}

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

const DUPLICATE_MESSAGE = 'Ya tienes una etiqueta con ese nombre.';
const NOT_FOUND_MESSAGE = 'La etiqueta indicada no existe.';

/** Mismo criterio que el índice único `receipt_tags_user_name_uidx`. */
const normalizedName = (value: string) => sql`immutable_unaccent(lower(${value}))`;

function toTag(row: { id: string; name: string; color: string | null }): ReceiptTag {
  return { id: row.id, name: row.name, color: row.color as ReceiptTagColor | null };
}

/**
 * Spec 051 H1: etiquetas libres de los tickets. Catálogo propio por usuario
 * (plan.md §0 decisión 4); el nombre es único sin distinguir mayúsculas ni
 * tildes, y lo garantiza el índice único de la base de datos.
 */
@Injectable()
export class ReceiptTagsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** H1 criterio 3: con cuántos tickets usa cada una. */
  async list(userId: string): Promise<ReceiptTagWithCount[]> {
    const rows = await this.db
      .select({ id: receiptTags.id, name: receiptTags.name, color: receiptTags.color, receiptCount: count(receiptTagLinks.receiptId) })
      .from(receiptTags)
      .leftJoin(receiptTagLinks, eq(receiptTagLinks.tagId, receiptTags.id))
      .where(eq(receiptTags.userId, userId))
      .groupBy(receiptTags.id)
      .orderBy(asc(sql`immutable_unaccent(lower(${receiptTags.name}))`));
    return rows.map((row) => ({ ...toTag(row), receiptCount: Number(row.receiptCount) }));
  }

  async create(userId: string, dto: CreateReceiptTagDto): Promise<ReceiptTag> {
    try {
      const [row] = await this.db.insert(receiptTags).values({ userId, name: dto.name, color: dto.color ?? null }).returning();
      return toTag(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(DUPLICATE_MESSAGE);
      throw err;
    }
  }

  async update(userId: string, tagId: string, dto: UpdateReceiptTagDto): Promise<ReceiptTag> {
    const changes: { name?: string; color?: string | null } = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.color !== undefined) changes.color = dto.color;
    try {
      const [row] = Object.keys(changes).length
        ? await this.db
            .update(receiptTags)
            .set(changes)
            .where(and(eq(receiptTags.id, tagId), eq(receiptTags.userId, userId)))
            .returning()
        : await this.db.select().from(receiptTags).where(and(eq(receiptTags.id, tagId), eq(receiptTags.userId, userId)));
      if (!row) throw new NotFoundException(NOT_FOUND_MESSAGE);
      return toTag(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(DUPLICATE_MESSAGE);
      throw err;
    }
  }

  /** H1 criterio 3: se quita de todos sus tickets (cascada), sin borrar ninguno. */
  async remove(userId: string, tagId: string): Promise<void> {
    const deleted = await this.db
      .delete(receiptTags)
      .where(and(eq(receiptTags.id, tagId), eq(receiptTags.userId, userId)))
      .returning({ id: receiptTags.id });
    if (deleted.length === 0) throw new NotFoundException(NOT_FOUND_MESSAGE);
  }

  /** `PUT /receipts/:id/tags`: comprueba que el ticket es del usuario. */
  async setForReceipt(userId: string, receiptId: string, dto: ReceiptTagsSelectionDto): Promise<ReceiptTag[]> {
    return this.db.transaction(async (tx) => {
      const [receipt] = await tx.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
      if (!receipt) throw new NotFoundException('El ticket indicado no existe.');
      return this.replaceLinks(tx, userId, receiptId, dto);
    });
  }

  /**
   * Sustituye las etiquetas de un ticket ya comprobado como del usuario
   * (también desde la confirmación de una importación, en su transacción).
   * Las etiquetas nuevas se crean, o se reutiliza la que ya tenga ese nombre.
   */
  async replaceLinks(executor: Executor, userId: string, receiptId: string, dto: ReceiptTagsSelectionDto): Promise<ReceiptTag[]> {
    const tagIds = new Set(dto.tagIds ?? []);
    if (tagIds.size > 0) {
      const owned = await executor
        .select({ id: receiptTags.id })
        .from(receiptTags)
        .where(and(inArray(receiptTags.id, [...tagIds]), eq(receiptTags.userId, userId)));
      if (owned.length !== tagIds.size) throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    for (const name of dto.newTags ?? []) {
      tagIds.add(await this.findOrCreate(executor, userId, name));
    }
    if (tagIds.size > MAX_TAGS_PER_RECEIPT) {
      throw new BadRequestException(`Un ticket puede tener como mucho ${MAX_TAGS_PER_RECEIPT} etiquetas.`);
    }

    await executor.delete(receiptTagLinks).where(eq(receiptTagLinks.receiptId, receiptId));
    if (tagIds.size > 0) {
      await executor.insert(receiptTagLinks).values([...tagIds].map((tagId) => ({ receiptId, tagId })));
    }
    return (await this.byReceipt(executor, [receiptId])).get(receiptId) ?? [];
  }

  /** Las etiquetas de cada ticket, por nombre. */
  async byReceipt(executor: Executor, receiptIds: string[]): Promise<Map<string, ReceiptTag[]>> {
    const result = new Map<string, ReceiptTag[]>();
    if (receiptIds.length === 0) return result;
    const rows = await executor
      .select({ receiptId: receiptTagLinks.receiptId, id: receiptTags.id, name: receiptTags.name, color: receiptTags.color })
      .from(receiptTagLinks)
      .innerJoin(receiptTags, eq(receiptTags.id, receiptTagLinks.tagId))
      .where(inArray(receiptTagLinks.receiptId, receiptIds))
      .orderBy(asc(sql`immutable_unaccent(lower(${receiptTags.name}))`));
    for (const row of rows) {
      const tags = result.get(row.receiptId) ?? [];
      tags.push(toTag(row));
      result.set(row.receiptId, tags);
    }
    return result;
  }

  private async findOrCreate(executor: Executor, userId: string, name: string): Promise<string> {
    const [existing] = await executor
      .select({ id: receiptTags.id })
      .from(receiptTags)
      .where(and(eq(receiptTags.userId, userId), sql`immutable_unaccent(lower(${receiptTags.name})) = ${normalizedName(name)}`));
    if (existing) return existing.id;
    const [created] = await executor.insert(receiptTags).values({ userId, name }).returning({ id: receiptTags.id });
    return created.id;
  }
}
