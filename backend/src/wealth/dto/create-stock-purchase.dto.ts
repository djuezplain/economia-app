import { IsDateString, IsUUID } from 'class-validator';
import { IsShareCount } from '../../common/is-share-count.decorator.js';
import { IsSharePrice } from '../../common/is-share-price.decorator.js';

/** H2 (spec 020). */
export class CreateStockPurchaseDto {
  @IsUUID()
  stockId!: string;

  @IsShareCount()
  shareCount!: string;

  @IsSharePrice()
  purchasePrice!: string;

  @IsDateString()
  date!: string;
}
