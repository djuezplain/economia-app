import { IsDateString, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/**
 * H2 criterio 5 (spec 024). `pensionPlanId` no es editable — mismo criterio
 * que `UpdateCryptoPurchaseDto`: una aportación mal asignada se borra y se
 * vuelve a crear en la posición correcta.
 */
export class UpdatePensionPlanContributionDto {
  @IsOptional()
  @IsMoneyAmount()
  amount?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
