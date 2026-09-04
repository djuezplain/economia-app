import { IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';
import { IsShareCount } from '../../common/is-share-count.decorator.js';

/** H2 (spec 020). */
export class CreateStockPurchaseDto {
  @IsUUID()
  stockId!: string;

  @IsShareCount()
  shareCount!: string;

  @IsMoneyAmount()
  purchasePrice!: string;
}
