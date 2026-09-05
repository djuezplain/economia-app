import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { pensionPlanContributions, pensionPlans } from '../db/schema/index.js';
import { PensionPlansService } from './pension-plans.service.js';
import type { CreatePensionPlanContributionDto } from './dto/create-pension-plan-contribution.dto.js';
import type { UpdatePensionPlanContributionDto } from './dto/update-pension-plan-contribution.dto.js';

export type PensionPlanContribution = typeof pensionPlanContributions.$inferSelect;

/**
 * H2 (spec 024). `pensionPlanContributions` no lleva `userId` propio
 * (esquema normalizado) — el aislamiento por usuario pasa siempre por
 * `PensionPlansService.findOwnOrThrow()` (reutilizado, no duplicado) —
 * mismo patrón que `CryptoPurchasesService`.
 */
@Injectable()
export class PensionPlanContributionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pensionPlansService: PensionPlansService,
  ) {}

  /** De la más reciente a la más antigua — mismo criterio que `PensionPlanValuationsService.list()`. */
  async list(userId: string): Promise<PensionPlanContribution[]> {
    const ownPlans = await this.db.query.pensionPlans.findMany({ where: eq(pensionPlans.userId, userId), columns: { id: true } });
    if (ownPlans.length === 0) return [];

    return this.db.query.pensionPlanContributions.findMany({
      where: inArray(
        pensionPlanContributions.pensionPlanId,
        ownPlans.map((p) => p.id),
      ),
      orderBy: [desc(pensionPlanContributions.date), desc(pensionPlanContributions.createdAt)],
    });
  }

  /** H2 criterio 6: 404 si `pensionPlanId` no es una posición propia. */
  async create(userId: string, dto: CreatePensionPlanContributionDto): Promise<PensionPlanContribution> {
    await this.pensionPlansService.findOwnOrThrow(userId, dto.pensionPlanId);

    const [contribution] = await this.db
      .insert(pensionPlanContributions)
      .values({ pensionPlanId: dto.pensionPlanId, amount: dto.amount, date: dto.date })
      .returning();
    return contribution;
  }

  async update(userId: string, id: string, dto: UpdatePensionPlanContributionDto): Promise<PensionPlanContribution> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(pensionPlanContributions)
      .set({
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(pensionPlanContributions.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(pensionPlanContributions).where(eq(pensionPlanContributions.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<PensionPlanContribution> {
    const contribution = await this.db.query.pensionPlanContributions.findFirst({ where: eq(pensionPlanContributions.id, id) });
    if (!contribution) {
      throw new NotFoundException('Aportación no encontrada.');
    }
    await this.pensionPlansService.findOwnOrThrow(userId, contribution.pensionPlanId);
    return contribution;
  }
}
