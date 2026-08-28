import { IsOptional, Matches } from 'class-validator';

/** H4 (spec 002). Sin `month`, el servicio usa el mes en curso. */
export class DashboardMonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month debe tener el formato YYYY-MM.' })
  month?: string;
}
