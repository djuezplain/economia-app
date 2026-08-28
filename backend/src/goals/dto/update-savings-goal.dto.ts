import { IsIn, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** `period` no es editable (plan.md §2) — para cambiar el periodo, se borra y se crea uno nuevo. */
export class UpdateSavingsGoalDto {
  @IsOptional()
  @IsIn(['AMOUNT', 'PERCENT'])
  targetType?: 'AMOUNT' | 'PERCENT';

  @IsOptional()
  @IsMoneyAmount()
  targetValue?: string;

  @IsOptional()
  @IsMoneyAmount()
  alertThresholdPercent?: string;
}
