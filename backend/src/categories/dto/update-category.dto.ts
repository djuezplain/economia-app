import { IsString, Length } from 'class-validator';

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
}
