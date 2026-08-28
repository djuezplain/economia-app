import { IsIn, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** `categoryId` no es editable (plan.md §2) — para cambiar de categoría, se borra y se crea uno nuevo. */
export class UpdateExpenseBudgetDto {
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
