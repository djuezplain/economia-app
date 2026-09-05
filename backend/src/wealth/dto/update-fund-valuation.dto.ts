import { IsDateString, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H3 criterio 4 (spec 021). `fundId` no es editable — mismo criterio que `UpdateFundPurchaseDto`. */
export class UpdateFundValuationDto {
  @IsOptional()
  @IsMoneyAmount()
  pricePerShare?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
