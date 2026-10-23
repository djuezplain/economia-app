import { IsUUID } from 'class-validator';

/** Spec 049 H3: movimiento con el que conciliar una ocurrencia, o que descartar como candidato. */
export class TransactionRefDto {
  @IsUUID()
  transactionId!: string;
}

/** Spec 049 H3 criterio 8: movimiento importado que se conserva al resolver un duplicado. */
export class KeepTransactionDto {
  @IsUUID()
  keepTransactionId!: string;
}
