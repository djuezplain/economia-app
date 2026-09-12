import { IsOptional, IsString, Length } from 'class-validator';

/** plan.md §3: `GET /products?search=` — búsqueda por nombre, para el emparejamiento de H4 criterio 1. */
export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  search?: string;
}
