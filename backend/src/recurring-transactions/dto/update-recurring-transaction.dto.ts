import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/** Spec 047, H1: edición parcial. `type` no es editable (mismo criterio que `UpdateTransactionDto`). */
export class UpdateRecurringTransactionDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  concept?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  merchant?: string;

  @IsOptional()
  @IsMoneyAmount()
  amount?: string;

  @IsOptional()
  @IsIn(['CARD', 'DIRECT_DEBIT', 'CASH', 'TRANSFER'])
  paymentMethod?: 'CARD' | 'DIRECT_DEBIT' | 'CASH' | 'TRANSFER';

  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY'])
  frequency?: 'MONTHLY' | 'YEARLY';

  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  /** `null` quita la fecha de fin. */
  @ValidateIf((o: UpdateRecurringTransactionDto) => o.endDate !== null && o.endDate !== undefined)
  @IsDateString({ strict: true })
  endDate?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Spec 049 H2. */
  @IsOptional()
  @IsBoolean()
  variableAmount?: boolean;

  /** Spec 049 H1: aviso por email antes de cada ocurrencia. */
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  /** Spec 049 H1 criterio 1: días de antelación del aviso (0 = el mismo día). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  reminderDaysBefore?: number;
}
