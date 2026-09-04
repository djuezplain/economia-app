import { IsIn, IsOptional } from 'class-validator';

/** H1 (spec 015). Sin `period`/`type`, el servicio usa `'month'`/`'EXPENSE'`. */
export class DashboardCategoryComparisonQueryDto {
  @IsOptional()
  @IsIn(['month', 'year'], { message: 'period debe ser month o year.' })
  period?: 'month' | 'year';

  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'], { message: 'type debe ser INCOME o EXPENSE.' })
  type?: 'INCOME' | 'EXPENSE';
}
