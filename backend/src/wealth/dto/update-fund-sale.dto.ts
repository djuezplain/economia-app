import { IsDateString, IsOptional } from 'class-validator';
import { IsShareCount } from '../../common/is-share-count.decorator.js';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/** H1 criterio 4 (spec 044). `fundId` no es editable — mismo criterio que `UpdateStockSaleDto`. */
export class UpdateFundSaleDto {
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
