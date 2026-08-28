import { IsIn, IsOptional } from 'class-validator';

export class ListCategoriesQueryDto {
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'])
  type?: 'INCOME' | 'EXPENSE';
}
