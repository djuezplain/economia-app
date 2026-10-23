import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/**
 * Spec 047, H1. Mismos campos (y mismas reglas) que `CreateTransactionDto`,
 * más la periodicidad. `subcategoryId`, `merchant` y `paymentMethod` solo
 * aplican a gastos — `RecurringTransactionsService` los rechaza en un ingreso.
 */
export class CreateRecurringTransactionDto {
  @IsIn(['INCOME', 'EXPENSE'])
  type!: 'INCOME' | 'EXPENSE';

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsString()
  @Length(1, 255)
  concept!: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  merchant?: string;

  @IsMoneyAmount()
  amount!: string;

  @IsOptional()
  @IsIn(['CARD', 'DIRECT_DEBIT', 'CASH', 'TRANSFER'])
  paymentMethod?: 'CARD' | 'DIRECT_DEBIT' | 'CASH' | 'TRANSFER';

  @IsIn(['MONTHLY', 'YEARLY'])
  frequency!: 'MONTHLY' | 'YEARLY';

  @IsDateString({ strict: true })
  startDate!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  /** Spec 049 H2: con `true`, `amount` es el importe inicial y las ocurrencias usan una estimación. */
  @IsOptional()
  @IsBoolean()
  variableAmount?: boolean;
}
