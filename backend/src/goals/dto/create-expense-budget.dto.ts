import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H2 (spec 004). `categoryId` se omite para el presupuesto global (plan.md §1). */
export class CreateExpenseBudgetDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsIn(['AMOUNT', 'PERCENT'])
  targetType!: 'AMOUNT' | 'PERCENT';

  @IsMoneyAmount()
  targetValue!: string;

  @IsMoneyAmount()
  alertThresholdPercent!: string;
}
