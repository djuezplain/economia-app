import { IsOptional, Matches } from 'class-validator';

/** H5 (spec 002). Sin `year`, el servicio usa el año en curso. */
export class DashboardYearQueryDto {
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'year debe tener el formato YYYY.' })
  year?: string;
}
