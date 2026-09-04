import { IsDateString, IsString, Length } from 'class-validator';
import { IsSignedMoneyAmount } from '../../common/is-signed-money-amount.decorator.js';

/** H2 (spec 018). */
export class CreateBankAccountEntryDto {
  @IsString()
  @Length(1, 100)
  bank!: string;

  @IsString()
  @Length(1, 50)
  accountNumber!: string;

  @IsSignedMoneyAmount()
  euros!: string;

  @IsDateString()
  date!: string;
}
