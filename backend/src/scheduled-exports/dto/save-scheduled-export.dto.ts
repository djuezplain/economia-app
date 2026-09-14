import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * H5 (spec 032), plan.md §11.6. Solo valida la forma de cada campo — qué
 * combinación de `dayOfWeek`/`dayOfMonth`/`destination` es válida según
 * `frequency` es una regla de negocio, no de forma, así que vive en
 * `ScheduledExportsService.save()` (mismo criterio ya documentado en el
 * proyecto para `CategoriesService`/`SavingsGoalsService`: la validación de
 * negocio en un único sitio, el servicio).
 */
export class SaveScheduledExportDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  frequency!: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeOfDay debe tener el formato HH:mm.' })
  timeOfDay!: string;

  @IsIn(['LOCAL', 'DRIVE'])
  destination!: 'LOCAL' | 'DRIVE';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  localSubfolder?: string;
}
