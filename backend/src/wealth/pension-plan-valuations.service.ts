import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { pensionPlanValuations, pensionPlans } from '../db/schema/index.js';
import { PensionPlansService } from './pension-plans.service.js';
import type { CreatePensionPlanValuationDto } from './dto/create-pension-plan-valuation.dto.js';
import type { UpdatePensionPlanValuationDto } from './dto/update-pension-plan-valuation.dto.js';

export type PensionPlanValuation = typeof pensionPlanValuations.$inferSelect;

/**
 * H3 (spec 024). Mismo patrón que `PensionPlanContributionsService`: sin
 * `userId` propio, aislamiento vía `PensionPlansService.findOwnOrThrow()`.
 */
@Injectable()
export class PensionPlanValuationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pensionPlansService: PensionPlansService,
  ) {}

  /** H3 criterio 4: de la más reciente a la más antigua, de todas las posiciones del usuario a la vez. */
  async list(userId: string): Promise<PensionPlanValuation[]> {
    const ownPlans = await this.db.query.pensionPlans.findMany({ where: eq(pensionPlans.userId, userId), columns: { id: true } });
    if (ownPlans.length === 0) return [];

    return this.db.query.pensionPlanValuations.findMany({
      where: inArray(
        pensionPlanValuations.pensionPlanId,
        ownPlans.map((p) => p.id),
      ),
      orderBy: [desc(pensionPlanValuations.date), desc(pensionPlanValuations.createdAt)],
    });
  }

  /** H3 criterio 6: 404 si `pensionPlanId` no es una posición propia. */
  async create(userId: string, dto: CreatePensionPlanValuationDto): Promise<PensionPlanValuation> {
    await this.pensionPlansService.findOwnOrThrow(userId, dto.pensionPlanId);

    const [valuation] = await this.db
      .insert(pensionPlanValuations)
      .values({ pensionPlanId: dto.pensionPlanId, value: dto.value, date: dto.date })
      .returning();
    return valuation;
  }

  async update(userId: string, id: string, dto: UpdatePensionPlanValuationDto): Promise<PensionPlanValuation> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(pensionPlanValuations)
      .set({
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(pensionPlanValuations.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(pensionPlanValuations).where(eq(pensionPlanValuations.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<PensionPlanValuation> {
    const valuation = await this.db.query.pensionPlanValuations.findFirst({ where: eq(pensionPlanValuations.id, id) });
    if (!valuation) {
      throw new NotFoundException('Valoración no encontrada.');
    }
    await this.pensionPlansService.findOwnOrThrow(userId, valuation.pensionPlanId);
    return valuation;
  }
}
