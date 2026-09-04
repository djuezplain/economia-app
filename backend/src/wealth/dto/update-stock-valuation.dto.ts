import { IsDateString, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H3 criterio 4 (spec 020). `stockId` no es editable — mismo criterio que `UpdateStockPurchaseDto`. */
export class UpdateStockValuationDto {
  @IsOptional()
  @IsMoneyAmount()
  pricePerShare?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
