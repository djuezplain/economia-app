import { IsDateString, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H2 (spec 024). */
export class CreatePensionPlanContributionDto {
  @IsUUID()
  pensionPlanId!: string;

  @IsMoneyAmount()
  amount!: string;

  @IsDateString()
  date!: string;
}
