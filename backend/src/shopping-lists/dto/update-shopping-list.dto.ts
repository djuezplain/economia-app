import { IsString, Length } from 'class-validator';

/** Spec 039, plan.md §2 (H1 criterio 2): renombrar una lista. */
export class UpdateShoppingListDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}
