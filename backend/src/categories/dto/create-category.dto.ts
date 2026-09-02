import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

/**
 * H3 (spec 002), criterio 2. `parentId` solo tiene sentido para categorías
 * de gasto (`type: 'EXPENSE'`) — un ingreso no tiene subcategoría
 * (`spec.md` §4). `CategoriesService.create` valida esa combinación (y que
 * el padre exista, sea propio, sea de gasto y no sea a su vez una
 * subcategoría) más allá de lo que `class-validator` puede expresar aquí.
 */
export class CreateCategoryDto {
  @IsIn(['INCOME', 'EXPENSE'])
  type!: 'INCOME' | 'EXPENSE';

  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  // Opcional (incluida la cadena vacía, tratada como "no especificado"):
  // sin él, `CategoriesService.create` infiere uno del nombre (ver
  // `category-icons.ts`) — el usuario puede elegir el suyo en su lugar.
  // `Length(0, 8)` da margen a un emoji compuesto (p. ej. "🏷️", símbolo +
  // selector de variación, 2 code points).
  @IsOptional()
  @IsString()
  @Length(0, 8)
  icon?: string;
}
