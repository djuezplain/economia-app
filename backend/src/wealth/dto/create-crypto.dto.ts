import { IsString, Length } from 'class-validator';

/** H1 (spec 022). */
export class CreateCryptoDto {
  @IsString()
  @Length(1, 100)
  exchange!: string;

  @IsString()
  @Length(1, 150)
  crypto!: string;
}
