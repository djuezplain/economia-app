import { IsDateString, IsUUID } from 'class-validator';
import { IsShareCount } from '../../common/is-share-count.decorator.js';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/** H1 (spec 031). Mismos decoradores que `CreateStockPurchaseDto` — misma precisión, campos análogos. */
export class CreateStockSaleDto {
  @IsUUID()
  stockId!: string;

  @IsShareCount()
  shareCount!: string;

  @IsSharePrice()
  salePrice!: string;

  @IsDateString()
  date!: string;
}
