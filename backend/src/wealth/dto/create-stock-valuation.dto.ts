import { IsDateString, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H3 (spec 020). */
export class CreateStockValuationDto {
  @IsUUID()
  stockId!: string;

  @IsMoneyAmount()
  pricePerShare!: string;

  @IsDateString()
  date!: string;
}
