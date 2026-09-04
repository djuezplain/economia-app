import { IsDateString, IsOptional, IsString, Length } from 'class-validator';
import { IsSignedMoneyAmount } from '../../common/is-signed-money-amount.decorator.js';

/** H2 criterio 5 (spec 018). */
export class UpdateBankAccountEntryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  bank?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  accountNumber?: string;

  @IsOptional()
  @IsSignedMoneyAmount()
  euros?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
