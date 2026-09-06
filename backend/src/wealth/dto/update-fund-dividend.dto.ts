import { IsDateString, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';
import { IsRetentionPercent } from '../../common/is-retention-percent.decorator.js';

/** H1 criterio 5 (spec 029). `fundId` no es editable — mismo criterio que `UpdateFundPurchaseDto`. */
export class UpdateFundDividendDto {
  @IsOptional()
  @IsMoneyAmount()
  netAmount?: string;

  @IsOptional()
  @IsRetentionPercent()
  retentionPercent?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
