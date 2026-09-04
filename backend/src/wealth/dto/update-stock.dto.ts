import { IsOptional, IsString, Length } from 'class-validator';

/** H1 criterio 3 (spec 020). */
export class UpdateStockDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  custodyBank?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  stock?: string;
}
