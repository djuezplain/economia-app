import { IsDateString, IsOptional } from 'class-validator';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/**
 * H3 criterio 4 (spec 021). `fundId` no es editable — mismo criterio que
 * `UpdateFundPurchaseDto`. `IsSharePrice` (8 decimales), mismo criterio que
 * `CreateFundValuationDto`.
 */
export class UpdateFundValuationDto {
  @IsOptional()
  @IsSharePrice({ message: 'El precio por participación debe ser un número positivo con hasta 8 decimales (p. ej. "28.50").' })
  pricePerShare?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
