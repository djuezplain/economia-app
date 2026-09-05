import { IsDateString, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H3 (spec 021). */
export class CreateFundValuationDto {
  @IsUUID()
  fundId!: string;

  @IsMoneyAmount()
  pricePerShare!: string;

  @IsDateString()
  date!: string;
}
