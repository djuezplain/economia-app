import { IsIn, IsOptional, Matches, ValidateIf } from 'class-validator';

/** H1 (spec 014). Sin `type`/`scope`, el servicio usa `'EXPENSE'`/`'historic'`. `year` solo es obligatorio (y se valida) cuando `scope='year'`. */
export class DashboardSeasonalQueryDto {
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'], { message: 'type debe ser INCOME o EXPENSE.' })
  type?: 'INCOME' | 'EXPENSE';

  @IsOptional()
  @IsIn(['historic', 'year'], { message: 'scope debe ser historic o year.' })
  scope?: 'historic' | 'year';

  @ValidateIf((query) => query.scope === 'year')
  @Matches(/^\d{4}$/, { message: 'year debe tener el formato YYYY y es obligatorio cuando scope=year.' })
  year?: string;
}
