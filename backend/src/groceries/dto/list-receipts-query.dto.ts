import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';

/**
 * Spec 040, plan.md §1: filtros de `GET /receipts` (spec.md H1). Todos
 * opcionales y combinables entre sí (Y lógico, criterio 5) — sin filtro
 * activo, se listan todos los tickets del usuario, igual que hoy.
 */
export class ListReceiptsQueryDto {
  @IsOptional()
  @IsUUID()
  supermarketId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsMoneyAmount()
  amountMin?: string;

  @IsOptional()
  @IsMoneyAmount()
  amountMax?: string;
}
