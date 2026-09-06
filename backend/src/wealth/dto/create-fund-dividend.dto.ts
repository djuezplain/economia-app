import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';
import { IsRetentionPercent } from '../../common/is-retention-percent.decorator.js';

/** H1 (spec 029). `retentionPercent` es opcional — si no se envía, la columna aplica su valor por defecto (19.00). */
export class CreateFundDividendDto {
  @IsUUID()
  fundId!: string;

  @IsMoneyAmount()
  netAmount!: string;

  @IsOptional()
  @IsRetentionPercent()
  retentionPercent?: string;

  @IsDateString()
  date!: string;
}
