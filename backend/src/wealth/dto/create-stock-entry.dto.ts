import { IsString, Length } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';
import { IsShareCount } from '../../common/is-share-count.decorator.js';

/** H3 (spec 018). `purchaseValue` no se pide aquí — se calcula, no se guarda (plan.md §1). */
export class CreateStockEntryDto {
  @IsString()
  @Length(1, 100)
  custodyBank!: string;

  @IsString()
  @Length(1, 150)
  stock!: string;

  @IsShareCount()
  shareCount!: string;

  @IsMoneyAmount()
  purchasePrice!: string;

  @IsMoneyAmount()
  currentValuation!: string;
}
