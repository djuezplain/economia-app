import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { IsMoneyAmount } from '../../common/is-money-amount.decorator.js';
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

  @ValidateNested()
  @Type(() => EntityRefDto)
  product!: EntityRefDto;
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

  @IsArray()
  @ArrayMinSize(1)
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
  @IsOptional()
  @IsUUID()
  documentId?: string;
}
