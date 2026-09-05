import { IsDateString, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/**
 * H2 criterio 5 (spec 025). `cashHoldingId` no es editable — mismo criterio
 * que `UpdateBankAccountBalanceDto.bankAccountId`: una entrada mal asignada
 * se borra y se vuelve a crear en la ubicación correcta, no se "mueve".
 */
export class UpdateCashBalanceDto {
  @IsOptional()
  @IsMoneyAmount()
  amount?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
