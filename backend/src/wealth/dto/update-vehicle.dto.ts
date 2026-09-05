import { IsDateString, IsOptional, IsString, Length } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H1 criterio 3 (spec 023). */
export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  brandModel?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  plate?: string;

  @IsOptional()
  @IsMoneyAmount()
  purchasePrice?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;
}
