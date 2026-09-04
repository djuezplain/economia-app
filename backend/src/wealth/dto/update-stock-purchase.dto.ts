import { IsDateString, IsOptional } from 'class-validator';
import { IsShareCount } from '../../common/is-share-count.decorator.js';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/**
 * H2 criterio 5 (spec 020). `stockId` no es editable (mismo criterio que
 * `bankAccountId` en `UpdateBankAccountBalanceDto`, spec 019): una compra
 * mal asignada se borra y se vuelve a crear en la acción correcta.
 */
export class UpdateStockPurchaseDto {
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
