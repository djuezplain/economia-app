import { IsUUID } from 'class-validator';

/** Spec 039, plan.md §2 (H1 criterio 2): añadir un producto del catálogo existente a la lista. */
export class AddShoppingListItemDto {
  @IsUUID()
  productId!: string;
}
