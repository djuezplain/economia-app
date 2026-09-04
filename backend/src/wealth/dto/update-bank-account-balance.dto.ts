import { IsDateString, IsOptional } from 'class-validator';
import { IsSignedMoneyAmount } from '../../common/is-signed-money-amount.decorator.js';

/**
 * H2 criterio 5 (spec 019). `bankAccountId` no es editable (plan.md §3): una
 * entrada de saldo mal asignada se borra y se vuelve a crear en la cuenta
 * correcta, no se "mueve" de cuenta.
 */
export class UpdateBankAccountBalanceDto {
  @IsOptional()
  @IsSignedMoneyAmount()
  euros?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
