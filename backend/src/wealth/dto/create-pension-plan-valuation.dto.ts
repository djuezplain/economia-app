import { IsDateString, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H3 (spec 024). */
export class CreatePensionPlanValuationDto {
  @IsUUID()
  pensionPlanId!: string;

  @IsMoneyAmount()
  value!: string;

  @IsDateString()
  date!: string;
}
