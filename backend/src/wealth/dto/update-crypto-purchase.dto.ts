import { IsDateString, IsOptional } from 'class-validator';
import { IsCryptoPrice } from '../../common/is-crypto-price.decorator.js';
import { IsCryptoQuantity } from '../../common/is-crypto-quantity.decorator.js';

/**
 * H2 criterio 5 (spec 022). `cryptoId` no es editable — mismo criterio que
 * `UpdateStockPurchaseDto`: una compra mal asignada se borra y se vuelve a
 * crear en la posición correcta.
 */
export class UpdateCryptoPurchaseDto {
  @IsOptional()
  @IsCryptoQuantity()
  quantity?: string;

  @IsOptional()
  @IsCryptoPrice()
  purchasePrice?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
