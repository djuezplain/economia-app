import { IsIn } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/**
 * H1 (spec 004). `IsMoneyAmount` se reutiliza tal cual (plan.md §5): exige
 * un decimal positivo con hasta dos decimales, formato válido tanto para
 * un importe como para un % — el límite superior de 100 para `PERCENT` no
 * lo sabe este decorador (no distingue importes de porcentajes), así que
 * lo comprueba `SavingsGoalsService` en la capa de servicio.
 */
export class CreateSavingsGoalDto {
  @IsIn(['MONTHLY', 'ANNUAL'])
  period!: 'MONTHLY' | 'ANNUAL';

  @IsIn(['AMOUNT', 'PERCENT'])
  targetType!: 'AMOUNT' | 'PERCENT';

  @IsMoneyAmount()
  targetValue!: string;

  @IsMoneyAmount()
  alertThresholdPercent!: string;
}
