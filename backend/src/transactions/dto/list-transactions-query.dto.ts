import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

/**
 * `plan.md` §2: filtros de `GET /transactions`. `dateFrom`/`dateTo` son
 * inclusivos; `TransactionsService` rechaza (400) si `dateFrom` es
 * posterior a `dateTo` (plan.md §6) — no se expresa aquí como una
 * validación cruzada de `class-validator` porque el resto del proyecto no
 * usa ese patrón (ver DTOs de spec 001), se comprueba en el servicio.
 */
export class ListTransactionsQueryDto {
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'])
  type?: 'INCOME' | 'EXPENSE';

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  merchant?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
