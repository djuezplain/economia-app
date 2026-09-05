import { IsString, Length } from 'class-validator';

/** H1 (spec 025). */
export class CreateCashHoldingDto {
  @IsString()
  @Length(1, 150)
  location!: string;
}
