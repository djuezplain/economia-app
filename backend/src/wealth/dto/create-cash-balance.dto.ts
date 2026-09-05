import { IsDateString, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H2 (spec 025). */
export class CreateCashBalanceDto {
  @IsUUID()
  cashHoldingId!: string;

  @IsMoneyAmount()
  amount!: string;

  @IsDateString()
  date!: string;
}
