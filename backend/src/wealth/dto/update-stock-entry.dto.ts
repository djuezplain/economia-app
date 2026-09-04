import { IsOptional, IsString, Length } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';
import { IsShareCount } from '../../common/is-share-count.decorator.js';

/** H3 criterio 4 (spec 018). */
export class UpdateStockEntryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  custodyBank?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  stock?: string;

  @IsOptional()
  @IsShareCount()
  shareCount?: string;

  @IsOptional()
  @IsMoneyAmount()
  purchasePrice?: string;

  @IsOptional()
  @IsMoneyAmount()
  currentValuation?: string;
}
