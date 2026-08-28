import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, eq, isNull } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { categories, expenseBudgets } from '../db/schema/index.js';
import type { CreateExpenseBudgetDto } from './dto/create-expense-budget.dto.js';
import type { UpdateExpenseBudgetDto } from './dto/update-expense-budget.dto.js';

export type ExpenseBudget = typeof expenseBudgets.$inferSelect;

/**
 * H2 (spec 004). Mismo criterio que `SavingsGoalsService`: "un presupuesto
 * por categoría, uno global" (plan.md §1) se comprueba aquí, no con una
 * constraint SQL.
 */
@Injectable()
export class ExpenseBudgetsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<ExpenseBudget[]> {
    return this.db.query.expenseBudgets.findMany({ where: eq(expenseBudgets.userId, userId) });
  }

  /** H2 criterio 4: 409 si ya existe un presupuesto para esa categoría (o global) — se edita, no se duplica. */
  async create(userId: string, dto: CreateExpenseBudgetDto): Promise<ExpenseBudget> {
    this.assertPercentWithinRange(dto.targetType, dto.targetValue);
    this.assertThresholdWithinRange(dto.alertThresholdPercent);

    if (dto.categoryId) {
      await this.assertValidExpenseCategory(userId, dto.categoryId);
    }

    const existing = await this.db.query.expenseBudgets.findFirst({
      where: dto.categoryId
        ? and(eq(expenseBudgets.userId, userId), eq(expenseBudgets.categoryId, dto.categoryId))
        : and(eq(expenseBudgets.userId, userId), isNull(expenseBudgets.categoryId)),
    });
    if (existing) {
      throw new ConflictException(
        dto.categoryId
          ? 'Ya existe un presupuesto para esta categoría. Edítalo en vez de crear uno nuevo.'
          : 'Ya existe un presupuesto global. Edítalo en vez de crear uno nuevo.',
      );
    }

    const [budget] = await this.db
      .insert(expenseBudgets)
      .values({
        userId,
        categoryId: dto.categoryId ?? null,
        targetType: dto.targetType,
        targetValue: dto.targetValue,
        alertThresholdPercent: dto.alertThresholdPercent,
      })
      .returning();
    return budget;
  }

  async update(userId: string, id: string, dto: UpdateExpenseBudgetDto): Promise<ExpenseBudget> {
    const existing = await this.findOwnOrThrow(userId, id);

    if (dto.targetType !== undefined || dto.targetValue !== undefined) {
      this.assertPercentWithinRange(dto.targetType ?? existing.targetType, dto.targetValue ?? existing.targetValue);
    }
    if (dto.alertThresholdPercent !== undefined) {
      this.assertThresholdWithinRange(dto.alertThresholdPercent);
    }

    const [updated] = await this.db
      .update(expenseBudgets)
      .set({
        ...(dto.targetType !== undefined && { targetType: dto.targetType }),
        ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
        ...(dto.alertThresholdPercent !== undefined && { alertThresholdPercent: dto.alertThresholdPercent }),
        updatedAt: new Date(),
      })
      .where(eq(expenseBudgets.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(expenseBudgets).where(eq(expenseBudgets.id, id));
  }

  /** H2 criterio 2 / plan.md §5: un presupuesto en % de los ingresos no puede superar el 100%. */
  private assertPercentWithinRange(targetType: string, targetValue: string): void {
    if (targetType === 'PERCENT' && new Decimal(targetValue).greaterThan(100)) {
      throw new BadRequestException('Un presupuesto en % de los ingresos no puede superar el 100%.');
    }
  }

  private assertThresholdWithinRange(alertThresholdPercent: string): void {
    if (new Decimal(alertThresholdPercent).greaterThan(100)) {
      throw new BadRequestException('El umbral de aviso no puede superar el 100%.');
    }
  }

  /**
   * H2 criterio 5: solo una categoría de gasto de nivel superior propia.
   * Ajena o inexistente → 404 (no confirmar recursos ajenos, mismo criterio
   * que `TransactionsService.validateCategoryAssignment`); de tipo
   * `INCOME` o subcategoría → 400 (dato de cliente incorrecto, no de
   * autorización).
   */
  private async assertValidExpenseCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.db.query.categories.findFirst({
      where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada.');
    }
    if (category.type !== 'EXPENSE') {
      throw new BadRequestException('Un presupuesto solo puede asociarse a una categoría de gasto.');
    }
    if (category.parentId) {
      throw new BadRequestException('Un presupuesto solo puede asociarse a una categoría de nivel superior, no a una subcategoría.');
    }
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<ExpenseBudget> {
    const budget = await this.db.query.expenseBudgets.findFirst({
      where: and(eq(expenseBudgets.id, id), eq(expenseBudgets.userId, userId)),
    });
    if (!budget) {
      throw new NotFoundException('Presupuesto no encontrado.');
    }
    return budget;
  }
}
