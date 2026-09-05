import { IsString, Length } from 'class-validator';

/** H1 (spec 024). */
export class CreatePensionPlanDto {
  @IsString()
  @Length(1, 100)
  managingEntity!: string;

  @IsString()
  @Length(1, 150)
  plan!: string;
}
