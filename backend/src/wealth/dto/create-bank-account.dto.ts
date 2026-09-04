import { IsString, Length } from 'class-validator';

/** H1 (spec 019). */
export class CreateBankAccountDto {
  @IsString()
  @Length(1, 100)
  bank!: string;

  @IsString()
  @Length(1, 50)
  accountNumber!: string;
}
