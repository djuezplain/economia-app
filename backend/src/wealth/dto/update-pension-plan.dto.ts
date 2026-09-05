import { IsOptional, IsString, Length } from 'class-validator';

/** H1 criterio 3 (spec 024). */
export class UpdatePensionPlanDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  managingEntity?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  plan?: string;
}
