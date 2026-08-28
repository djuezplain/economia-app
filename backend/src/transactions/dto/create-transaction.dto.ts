import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/**
 * H1/H2 (spec 002). `subcategoryId`, `merchant` y `paymentMethod` solo
 * tienen sentido para `type: 'EXPENSE'` (`spec.md` §4) — `TransactionsService`
 * los rechaza (400) si se mandan en un ingreso, y valida que la subcategoría
 * (si se manda) sea hija de la categoría indicada.
 */
export class CreateTransactionDto {
  @IsIn(['INCOME', 'EXPENSE'])
  type!: 'INCOME' | 'EXPENSE';

  @IsDateString()
  date!: string;

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
}
