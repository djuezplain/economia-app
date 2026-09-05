import { IsString, Length } from 'class-validator';

/** H1 (spec 021). */
export class CreateFundDto {
  @IsString()
  @Length(1, 100)
  custodyBank!: string;

  @IsString()
  @Length(1, 150)
  fund!: string;
}
