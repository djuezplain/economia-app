import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

  /** Spec 051 H2: texto a buscar (comercio, etiquetas, nota, líneas, productos y texto del documento). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /** Spec 051 H1 criterio 4: el ticket tiene todas estas etiquetas. `?tagIds=a&tagIds=b`. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  tagIds?: string[];

  /** Spec 051 H5 criterio 2: con garantía vigente, o que caduca en los próximos 30 días. */
  @IsOptional()
  @IsIn(['active', 'expiring'])
  warranty?: 'active' | 'expiring';
}
