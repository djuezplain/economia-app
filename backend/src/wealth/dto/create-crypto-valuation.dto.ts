import { IsDateString, IsUUID } from 'class-validator';
import { IsCryptoPrice } from '../../common/is-crypto-price.decorator.js';

/** H3 (spec 022). */
export class CreateCryptoValuationDto {
  @IsUUID()
  cryptoId!: string;

  @IsCryptoPrice()
  pricePerUnit!: string;

  @IsDateString()
  date!: string;
}
