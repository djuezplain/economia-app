import { IsOptional, IsString, Length } from 'class-validator';

/** H1 criterio 3 (spec 022). */
export class UpdateCryptoDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  exchange?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  crypto?: string;
}
