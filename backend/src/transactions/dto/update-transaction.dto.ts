import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/**
 * `plan.md` §2: edición parcial. `type` no se puede cambiar después de
 * crear el movimiento (a diferencia del resto de campos) — cambiarlo
 * arrastraría tener que revalidar/limpiar los campos exclusivos de gasto
 * (subcategoría, comercio, tipo de pago) en la misma petición, y no lo pide
 * ningún criterio de aceptación; si hace falta, se borra y se crea de
 * nuevo con el tipo correcto.
 */
export class UpdateTransactionDto {
  @IsOptional()
  @IsDateString()
  date?: string;

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
}
