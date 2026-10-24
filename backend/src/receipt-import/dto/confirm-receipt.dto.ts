import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { MAX_NOTE_LENGTH, normalizeNote } from '../../groceries/dto/receipt-details.dto.js';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';
import { ReceiptTagsSelectionDto } from '../../groceries/dto/receipt-tag.dto.js';
import { IsReceiptQuantity } from '../../common/is-receipt-quantity.decorator.js';
import { IsReceiptUnitPrice } from '../../common/is-receipt-unit-price.decorator.js';

/**
 * Spec 034, plan.md §3/§7: `{ id }` (existente) o `{ name }` (nuevo) — mismo
 * criterio que `DeleteAccountDto` (spec 001): ambos campos opcionales a
 * nivel de DTO, el service decide cuál corresponde y rechaza con un mensaje
 * claro si falta el que tocaba o llegan los dos vacíos.
 */
export class EntityRefDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

export class ConfirmReceiptLineDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsReceiptQuantity()
  quantity!: string;

  @IsIn(['unidad', 'kg'])
  unit!: 'unidad' | 'kg';

  @IsReceiptUnitPrice()
  pricePerUnit!: string;

  @IsMoneyAmount()
  amount!: string;

  /** Spec 048 H2 criterio 4: `null` = línea sin emparejar con ningún producto (no entra en la comparativa). */
  @ValidateIf((line: ConfirmReceiptLineDto) => line.product !== null)
  @ValidateNested()
  @Type(() => EntityRefDto)
  product!: EntityRefDto | null;
}

/**
 * plan.md §7: a diferencia de spec 003/032/033, no se vuelve a subir la
 * imagen — este es el DTO de lo que Diego ya corrigió en la vista previa
 * (H2), única fuente de verdad para lo que se guarda.
 */
export class ConfirmReceiptDto {
  @ValidateNested()
  @Type(() => EntityRefDto)
  supermarket!: EntityRefDto;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsMoneyAmount()
  printedTotal?: string;

  // Spec 048 H2 criterio 2: un ticket o factura puede guardarse sin líneas
  // (entonces el total impreso es obligatorio, ver `assertReceiptHasAmount`).
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmReceiptLineDto)
  lines!: ConfirmReceiptLineDto[];
}

/**
 * Spec 048 H1 criterio 1: al confirmar una importación, el documento que se
 * guardó como pendiente en la vista previa. Solo aquí: editar un ticket
 * guardado (`PUT /receipts/:id`, spec 035) no toca el documento, que tiene
 * sus propios endpoints.
 */
export class ConfirmImportReceiptDto extends ConfirmReceiptDto {
  /** Spec 051 H4 criterio 1: nota escrita al revisar la importación. */
  @Transform(normalizeNote)
  @ValidateIf((dto: ConfirmImportReceiptDto) => dto.note !== null && dto.note !== undefined)
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH, { message: `La nota no puede tener más de ${MAX_NOTE_LENGTH} caracteres.` })
  note?: string | null;

  /** Spec 051 H1 criterio 5: etiquetas elegidas al revisar la importación. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptTagsSelectionDto)
  tags?: ReceiptTagsSelectionDto;

  @IsOptional()
  @IsUUID()
  documentId?: string;
}
