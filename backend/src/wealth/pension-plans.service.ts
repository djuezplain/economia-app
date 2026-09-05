import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { pensionPlans } from '../db/schema/index.js';
import type { CreatePensionPlanDto } from './dto/create-pension-plan.dto.js';
import type { UpdatePensionPlanDto } from './dto/update-pension-plan.dto.js';

export type PensionPlan = typeof pensionPlans.$inferSelect;

/**
 * H1 (spec 024). Igual que `CryptosService` (spec 022): ningún método
 * acepta una consulta sin `userId` explícito, y "misma posición dos veces"
 * se comprueba aquí (409), no con una constraint SQL.
 */
@Injectable()
export class PensionPlansService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<PensionPlan[]> {
    return this.db.query.pensionPlans.findMany({ where: eq(pensionPlans.userId, userId) });
  }

  /** H1 criterio 2: 409 si ya existe una posición con la misma entidad gestora + plan. */
  async create(userId: string, dto: CreatePensionPlanDto): Promise<PensionPlan> {
    await this.assertNotDuplicate(userId, dto.managingEntity, dto.plan);

    const [plan] = await this.db
      .insert(pensionPlans)
      .values({ userId, managingEntity: dto.managingEntity, plan: dto.plan })
      .returning();
    return plan;
  }

  /** H1 criterio 3: editable, repitiendo la comprobación de unicidad si cambia entidad gestora o plan. */
  async update(userId: string, id: string, dto: UpdatePensionPlanDto): Promise<PensionPlan> {
    const existing = await this.findOwnOrThrow(userId, id);

    if (dto.managingEntity !== undefined || dto.plan !== undefined) {
      await this.assertNotDuplicate(userId, dto.managingEntity ?? existing.managingEntity, dto.plan ?? existing.plan, id);
    }

    const [updated] = await this.db
      .update(pensionPlans)
      .set({
        ...(dto.managingEntity !== undefined && { managingEntity: dto.managingEntity }),
        ...(dto.plan !== undefined && { plan: dto.plan }),
        updatedAt: new Date(),
      })
      .where(eq(pensionPlans.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: los historiales de aportaciones y valoraciones se borran en cascada (ON DELETE CASCADE). */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(pensionPlans).where(eq(pensionPlans.id, id));
  }

  async findOwnOrThrow(userId: string, id: string): Promise<PensionPlan> {
    const plan = await this.db.query.pensionPlans.findFirst({
      where: and(eq(pensionPlans.id, id), eq(pensionPlans.userId, userId)),
    });
    if (!plan) {
      throw new NotFoundException('Plan de pensiones no encontrado.');
    }
    return plan;
  }

  private async assertNotDuplicate(userId: string, managingEntity: string, plan: string, excludeId?: string): Promise<void> {
    const existing = await this.db.query.pensionPlans.findFirst({
      where: and(
        eq(pensionPlans.userId, userId),
        eq(pensionPlans.managingEntity, managingEntity),
        eq(pensionPlans.plan, plan),
        ...(excludeId ? [ne(pensionPlans.id, excludeId)] : []),
      ),
    });
    if (existing) {
      throw new ConflictException(
        'Ya tienes registrado ese plan de pensiones (misma entidad gestora y plan). Añade la aportación o valoración dentro de él.',
      );
    }
  }
}
