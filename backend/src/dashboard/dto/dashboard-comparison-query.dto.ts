import { IsIn, IsOptional } from 'class-validator';

/** H1 (spec 013). Sin `period`/`type`, el servicio usa `'month'`/`'EXPENSE'`. */
export class DashboardComparisonQueryDto {
  @IsOptional()
  @IsIn(['week', 'month', 'quarter', 'year'], { message: 'period debe ser week, month, quarter o year.' })
  period?: 'week' | 'month' | 'quarter' | 'year';

  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'], { message: 'type debe ser INCOME o EXPENSE.' })
  type?: 'INCOME' | 'EXPENSE';
}
