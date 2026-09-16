import { IsString, Length } from 'class-validator';

/** Spec 041, plan.md §1 (H1). Mismo límite que la columna `products.name` (`varchar(150)`). */
export class CreateProductDto {
  @IsString()
  @Length(1, 150)
  name!: string;
}
