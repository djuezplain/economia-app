import { IsOptional, IsString, Length } from 'class-validator';

/** H1 (spec 019). */
export class CreateBankAccountDto {
  @IsString()
  @Length(1, 100)
  bank!: string;

  @IsString()
  @Length(1, 50)
  accountNumber!: string;

  /** H1 (spec 021): opcional, no participa en la unicidad de la cuenta. */
  @IsOptional()
  @IsString()
  @Length(0, 100)
  alias?: string;
}
