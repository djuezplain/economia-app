import { IsDateString, IsString, Length } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H1 (spec 023). */
export class CreateVehicleDto {
  @IsString()
  @Length(1, 150)
  brandModel!: string;

  @IsString()
  @Length(1, 20)
  plate!: string;

  @IsMoneyAmount()
  purchasePrice!: string;

  @IsDateString()
  purchaseDate!: string;
}
