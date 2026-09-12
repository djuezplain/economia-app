import { IsString, Length } from 'class-validator';

/** Spec 036, plan.md §2 (H3). Mismo límite que la columna `products.name` (`varchar(150)`). */
export class UpdateProductDto {
  @IsString()
  @Length(1, 150)
  name!: string;
}
