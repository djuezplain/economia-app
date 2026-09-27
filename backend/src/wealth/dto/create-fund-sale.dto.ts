import { IsDateString, IsUUID } from 'class-validator';
import { IsShareCount } from '../../common/is-share-count.decorator.js';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/** H1 (spec 044). Mismos decoradores que `CreateFundPurchaseDto`/`CreateStockSaleDto` — misma precisión, campos análogos. */
export class CreateFundSaleDto {
  @IsUUID()
  fundId!: string;

  @IsShareCount()
  shareCount!: string;

  @IsSharePrice()
  salePrice!: string;

  @IsDateString()
  date!: string;
}
