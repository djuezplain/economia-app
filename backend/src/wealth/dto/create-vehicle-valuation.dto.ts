import { IsDateString, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** H2 (spec 023). */
export class CreateVehicleValuationDto {
  @IsUUID()
  vehicleId!: string;

  @IsMoneyAmount()
  value!: string;

  @IsDateString()
  date!: string;
}
