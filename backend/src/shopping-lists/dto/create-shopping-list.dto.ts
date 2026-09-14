import { IsString, Length } from 'class-validator';

/** Spec 039, plan.md §2 (H1). Mismo límite que la columna `shopping_lists.name` (`varchar(100)`). */
export class CreateShoppingListDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}
