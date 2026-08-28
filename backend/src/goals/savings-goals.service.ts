import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { savingsGoals } from '../db/schema/index.js';
import type { CreateSavingsGoalDto } from './dto/create-savings-goal.dto.js';
import type { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto.js';

export type SavingsGoal = typeof savingsGoals.$inferSelect;

/**
 * H1 (spec 004). Igual que `CategoriesService`/`TransactionsService`:
 * ningún método acepta una consulta sin `userId` explícito, y las reglas de
 * negocio (aquí, "un objetivo por periodo", plan.md §1) se comprueban en el
 * servicio, no con una constraint SQL.
 */
@Injectable()
export class SavingsGoalsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<SavingsGoal[]> {
    return this.db.query.savingsGoals.findMany({ where: eq(savingsGoals.userId, userId) });
  }

  /** H1 criterio 4: 409 si ya existe un objetivo para ese `period` — se edita, no se duplica. */
  async create(userId: string, dto: CreateSavingsGoalDto): Promise<SavingsGoal> {
    this.assertPercentWithinRange(dto.targetType, dto.targetValue);
    this.assertThresholdWithinRange(dto.alertThresholdPercent);

    const existing = await this.db.query.savingsGoals.findFirst({
      where: and(eq(savingsGoals.userId, userId), eq(savingsGoals.period, dto.period)),
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un objetivo de ahorro ${dto.period === 'MONTHLY' ? 'mensual' : 'anual'}. Edítalo en vez de crear uno nuevo.`,
      );
    }

    const [goal] = await this.db
      .insert(savingsGoals)
      .values({
        userId,
        period: dto.period,
        targetType: dto.targetType,
        targetValue: dto.targetValue,
        alertThresholdPercent: dto.alertThresholdPercent,
      })
      .returning();
    return goal;
  }

  async update(userId: string, id: string, dto: UpdateSavingsGoalDto): Promise<SavingsGoal> {
    const existing = await this.findOwnOrThrow(userId, id);

    if (dto.targetType !== undefined || dto.targetValue !== undefined) {
      this.assertPercentWithinRange(dto.targetType ?? existing.targetType, dto.targetValue ?? existing.targetValue);
    }
    if (dto.alertThresholdPercent !== undefined) {
      this.assertThresholdWithinRange(dto.alertThresholdPercent);
    }

    const [updated] = await this.db
      .update(savingsGoals)
      .set({
        ...(dto.targetType !== undefined && { targetType: dto.targetType }),
        ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
        ...(dto.alertThresholdPercent !== undefined && { alertThresholdPercent: dto.alertThresholdPercent }),
        updatedAt: new Date(),
      })
      .where(eq(savingsGoals.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(savingsGoals).where(eq(savingsGoals.id, id));
  }

  /** H1 criterio 1 / plan.md §5: un objetivo en % de los ingresos no puede superar el 100%. */
  private assertPercentWithinRange(targetType: string, targetValue: string): void {
    if (targetType === 'PERCENT' && new Decimal(targetValue).greaterThan(100)) {
      throw new BadRequestException('Un objetivo de ahorro en % de los ingresos no puede superar el 100%.');
    }
  }

  private assertThresholdWithinRange(alertThresholdPercent: string): void {
    if (new Decimal(alertThresholdPercent).greaterThan(100)) {
      throw new BadRequestException('El umbral de aviso no puede superar el 100%.');
    }
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<SavingsGoal> {
    const goal = await this.db.query.savingsGoals.findFirst({
      where: and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)),
    });
    if (!goal) {
      throw new NotFoundException('Objetivo de ahorro no encontrado.');
    }
    return goal;
  }
}
