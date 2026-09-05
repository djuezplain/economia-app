import { IsOptional, IsString, Length } from 'class-validator';

/** H1 criterio 3 (spec 025). */
export class UpdateCashHoldingDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  location?: string;
}
