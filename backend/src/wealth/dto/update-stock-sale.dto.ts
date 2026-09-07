import { IsDateString, IsOptional } from 'class-validator';
import { IsShareCount } from '../../common/is-share-count.decorator.js';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/** H1 criterio 4 (spec 031). `stockId` no es editable — mismo criterio que `UpdateStockPurchaseDto`. */
export class UpdateStockSaleDto {
  @IsOptional()
  @IsShareCount()
  shareCount?: string;

  @IsOptional()
  @IsSharePrice()
  salePrice?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
