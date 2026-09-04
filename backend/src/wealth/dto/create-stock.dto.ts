import { IsString, Length } from 'class-validator';

/** H1 (spec 020). */
export class CreateStockDto {
  @IsString()
  @Length(1, 100)
  custodyBank!: string;

  @IsString()
  @Length(1, 150)
  stock!: string;
}
