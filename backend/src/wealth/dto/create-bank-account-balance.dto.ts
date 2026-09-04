import { IsDateString, IsUUID } from 'class-validator';
import { IsSignedMoneyAmount } from '../../common/is-signed-money-amount.decorator.js';

/** H2 (spec 019). */
export class CreateBankAccountBalanceDto {
  @IsUUID()
  bankAccountId!: string;

  @IsSignedMoneyAmount()
  euros!: string;

  @IsDateString()
  date!: string;
}
