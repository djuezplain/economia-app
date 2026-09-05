import { IsDateString, IsOptional } from 'class-validator';
import { IsCryptoPrice } from '../../common/is-crypto-price.decorator.js';

/** H3 criterio 5 (spec 022). `cryptoId` no es editable — mismo criterio que `UpdateCryptoPurchaseDto`. */
export class UpdateCryptoValuationDto {
  @IsOptional()
  @IsCryptoPrice()
  pricePerUnit?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
