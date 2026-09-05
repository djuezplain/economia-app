import { IsDateString, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H3 criterio 5 (spec 024). `pensionPlanId` no es editable — mismo criterio que `UpdatePensionPlanContributionDto`. */
export class UpdatePensionPlanValuationDto {
  @IsOptional()
  @IsMoneyAmount()
  value?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
