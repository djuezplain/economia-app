import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, ilike, lte } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { categories, transactions } from '../db/schema/index.js';
import { average, distinctMonthsCount, groupByCategory, groupBySubcategory, sumAmounts } from './transactions.calculations.js';
import type { CreateTransactionDto } from './dto/create-transaction.dto.js';
import type { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import type { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';

export type Transaction = typeof transactions.$inferSelect;
type MovementType = Transaction['type'];

export interface TransactionsSummary {
  total: string;
  averagePerMonth: string | null;
  byCategory: Array<{ categoryId: string; total: string }>;
  /** H2 criterio 4 (spec.md §2). Solo los gastos con subcategoría entran aquí. */
  bySubcategory: Array<{ subcategoryId: string; total: string }>;
}

export interface ListTransactionsResult {
  items: Transaction[];
  page: number;
  limit: number;
  totalItems: number;
  summary: TransactionsSummary;
}

const DEFAULT_PAGE_SIZE = 50;

/**
 * H1/H2 (spec 002). Igual que `CategoriesService`: ningún método acepta una
 * consulta sin `userId` explícito.
 */
@Injectable()
export class TransactionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(userId: string, dto: CreateTransactionDto): Promise<Transaction> {
    this.assertExpenseOnlyFields(dto.type, dto);
    await this.validateCategoryAssignment(userId, dto.type, dto.categoryId, dto.subcategoryId);

    const [transaction] = await this.db
      .insert(transactions)
      .values({
        userId,
        type: dto.type,
        date: dto.date,
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId ?? null,
        concept: dto.concept,
        merchant: dto.merchant ?? null,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod ?? null,
      })
      .returning();
    return transaction;
  }

  /**
   * `plan.md` §6: filtros combinables. El resumen (`summary`) se calcula
   * sobre TODO el conjunto filtrado, no solo la página devuelta en `items`
   * — H1/H2 criterio 4 pide el total y la media del conjunto que se está
   * mirando, no de una página concreta de 50 resultados.
   */
  async list(userId: string, query: ListTransactionsQueryDto): Promise<ListTransactionsResult> {
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      throw new BadRequestException('El rango de fechas no es válido: "dateFrom" es posterior a "dateTo".');
    }

    const conditions = [eq(transactions.userId, userId)];
    if (query.type) conditions.push(eq(transactions.type, query.type));
    if (query.dateFrom) conditions.push(gte(transactions.date, query.dateFrom));
    if (query.dateTo) conditions.push(lte(transactions.date, query.dateTo));
    if (query.categoryId) conditions.push(eq(transactions.categoryId, query.categoryId));
    if (query.subcategoryId) conditions.push(eq(transactions.subcategoryId, query.subcategoryId));
    if (query.merchant) conditions.push(ilike(transactions.merchant, `%${query.merchant}%`));
    if (query.q) conditions.push(ilike(transactions.concept, `%${query.q}%`));

    const allMatching = await this.db.query.transactions.findMany({
      where: and(...conditions),
      orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    });

    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const items = allMatching.slice((page - 1) * limit, (page - 1) * limit + limit);

    const total = sumAmounts(allMatching);
    const months = distinctMonthsCount(allMatching.map((t) => t.date));

    return {
      items,
      page,
      limit,
      totalItems: allMatching.length,
      summary: {
        total,
        averagePerMonth: allMatching.length > 0 ? average(total, months) : null,
        byCategory: groupByCategory(allMatching),
        bySubcategory: groupBySubcategory(allMatching),
      },
    };
  }

  /**
   * Spec 006 (páginas de movimientos), `plan.md` §3: necesario para que
   * "Registrar" en modo edición pueda cargar el movimiento a partir del
   * `:id` de la URL (antes no hacía falta, `MovementsPage` ya tenía el
   * objeto completo en memoria desde el listado).
   */
  async findOne(userId: string, id: string): Promise<Transaction> {
    return this.findOwnOrThrow(userId, id);
  }

  /**
   * `type` no es editable (ver `UpdateTransactionDto`) — se usa el `type`
   * ya guardado del movimiento para revalidar la combinación de campos si
   * se cambia `categoryId`/`subcategoryId`.
   */
  async update(userId: string, id: string, dto: UpdateTransactionDto): Promise<Transaction> {
    const existing = await this.findOwnOrThrow(userId, id);
    this.assertExpenseOnlyFields(existing.type, dto);

    if (dto.categoryId || dto.subcategoryId !== undefined) {
      await this.validateCategoryAssignment(
        userId,
        existing.type,
        dto.categoryId ?? existing.categoryId,
        dto.subcategoryId !== undefined ? dto.subcategoryId : (existing.subcategoryId ?? undefined),
      );
    }

    const [updated] = await this.db
      .update(transactions)
      .set({
        ...(dto.date !== undefined && { date: dto.date }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.subcategoryId !== undefined && { subcategoryId: dto.subcategoryId }),
        ...(dto.concept !== undefined && { concept: dto.concept }),
        ...(dto.merchant !== undefined && { merchant: dto.merchant }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.paymentMethod !== undefined && { paymentMethod: dto.paymentMethod }),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(transactions).where(eq(transactions.id, id));
  }

  /** H1/H2 (spec.md §4): los campos de gasto no aplican a un ingreso. */
  private assertExpenseOnlyFields(
    type: MovementType,
    fields: { subcategoryId?: string; merchant?: string; paymentMethod?: string },
  ): void {
    if (type === 'INCOME' && (fields.subcategoryId || fields.merchant || fields.paymentMethod)) {
      throw new BadRequestException(
        'Un ingreso no admite subcategoría, comercio ni tipo de pago (solo aplican a gastos).',
      );
    }
  }

  /**
   * `categoryId`/`subcategoryId` ajenos o inexistentes se tratan como 404
   * (no confirmar recursos ajenos, mismo criterio que `CategoriesService`);
   * un desajuste de tipo con una categoría que sí existe y es propia es un
   * error de datos del cliente (400), no un problema de autorización.
   */
  private async validateCategoryAssignment(
    userId: string,
    type: MovementType,
    categoryId: string,
    subcategoryId?: string,
  ): Promise<void> {
    const category = await this.db.query.categories.findFirst({
      where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada.');
    }
    if (category.type !== type) {
      throw new BadRequestException('La categoría no coincide con el tipo del movimiento.');
    }

    if (subcategoryId) {
      if (type !== 'EXPENSE') {
        throw new BadRequestException('Las subcategorías solo existen para gastos.');
      }
      const subcategory = await this.db.query.categories.findFirst({
        where: and(eq(categories.id, subcategoryId), eq(categories.userId, userId)),
      });
      if (!subcategory) {
        throw new NotFoundException('Subcategoría no encontrada.');
      }
      if (subcategory.parentId !== categoryId) {
        throw new BadRequestException('La subcategoría indicada no pertenece a la categoría indicada.');
      }
    }
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<Transaction> {
    const transaction = await this.db.query.transactions.findFirst({
      where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
    });
    if (!transaction) {
      throw new NotFoundException('Movimiento no encontrado.');
    }
    return transaction;
  }
}
