import { IsDateString, IsOptional } from 'class-validator';
import { IsShareCount } from '../../common/is-share-count.decorator.js';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/**
 * H2 criterio 5 (spec 021). `fundId` no es editable — mismo criterio que
 * `UpdateStockPurchaseDto` (spec 020): una compra mal asignada se borra y se
 * vuelve a crear en el fondo correcto.
 */
export class UpdateFundPurchaseDto {
  @IsOptional()
  @IsShareCount()
  shareCount?: string;

  @IsOptional()
  @IsSharePrice()
  purchasePrice?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
