import { IsDateString, IsUUID } from 'class-validator';
import { IsCryptoPrice } from '../../common/is-crypto-price.decorator.js';
import { IsCryptoQuantity } from '../../common/is-crypto-quantity.decorator.js';

/** H2 (spec 022). */
export class CreateCryptoPurchaseDto {
  @IsUUID()
  cryptoId!: string;

  @IsCryptoQuantity()
  quantity!: string;

  @IsCryptoPrice()
  purchasePrice!: string;

  @IsDateString()
  date!: string;
}
