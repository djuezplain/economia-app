import { IsDateString, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/**
 * H2 criterio 5 (spec 023). `vehicleId` no es editable — mismo criterio que
 * `UpdateBankAccountBalanceDto.bankAccountId`: una valoración mal asignada
 * se borra y se vuelve a crear en el vehículo correcto, no se "mueve".
 */
export class UpdateVehicleValuationDto {
  @IsOptional()
  @IsMoneyAmount()
  value?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
