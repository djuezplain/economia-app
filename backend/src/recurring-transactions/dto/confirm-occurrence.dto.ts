import { IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** Spec 047, H3: al confirmar se puede ajustar el importe real de esa ocurrencia. */
export class ConfirmOccurrenceDto {
  @IsOptional()
  @IsMoneyAmount()
  amount?: string;
}
