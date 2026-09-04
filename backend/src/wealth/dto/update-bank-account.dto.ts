import { IsOptional, IsString, Length } from 'class-validator';

/** H1 criterio 3 (spec 019). */
export class UpdateBankAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  bank?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  accountNumber?: string;
}
