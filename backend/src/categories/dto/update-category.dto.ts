import { IsOptional, IsString, Length } from 'class-validator';

/**
 * `plan.md` §2: `PATCH /categories/:id` solo permite renombrar — el tipo y
 * el padre de una categoría no se pueden cambiar después de crearla (mover
 * una categoría de tipo o de padre tendría implicaciones sobre los
 * movimientos que ya la usan que esta spec no pide resolver).
 */
export class UpdateCategoryDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  // Opcional: si no se manda, el icono no cambia. Cadena vacía = "volver a
  // automático" (`CategoriesService.update` la guarda como `null`, y a
  // partir de ahí se infiere del nombre en cada lectura — ver
  // `category-icons.ts`), no "sin cambios" — el frontend solo la manda
  // cuando el usuario elige explícitamente esa opción en el selector.
  @IsOptional()
  @IsString()
  @Length(0, 8)
  icon?: string;
}
