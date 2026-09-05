import { IsDateString, IsUUID } from 'class-validator';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/**
 * H3 (spec 021). `pricePerShare` con `IsSharePrice` (8 decimales), no
 * `IsMoneyAmount` (2) — a diferencia de `stockValuations.pricePerShare`,
 * Diego pidió la misma precisión que el historial de compras para valores
 * liquidativos muy fraccionados. Mensaje propio: el de `IsSharePrice` habla
 * de "precio de compra", que no aplica aquí.
 */
export class CreateFundValuationDto {
  @IsUUID()
  fundId!: string;

  @IsSharePrice({ message: 'El precio por participación debe ser un número positivo con hasta 8 decimales (p. ej. "28.50").' })
  pricePerShare!: string;

  @IsDateString()
  date!: string;
}
