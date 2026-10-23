import { IsUUID } from 'class-validator';

/** Spec 048 H3: el gasto con el que enlazar un ticket. */
export class LinkTransactionDto {
  @IsUUID()
  transactionId!: string;
}
