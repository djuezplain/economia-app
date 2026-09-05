import { IsOptional, IsString, Length } from 'class-validator';

/** H1 criterio 3 (spec 021). */
export class UpdateFundDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  custodyBank?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  fund?: string;
}
