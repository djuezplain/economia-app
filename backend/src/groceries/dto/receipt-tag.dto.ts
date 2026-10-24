import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { RECEIPT_TAG_COLORS } from '../../db/schema/index.js';
import type { ReceiptTagColor } from '../../db/schema/index.js';

/** Spec 051 H1: como mucho 20 etiquetas por ticket. */
export const MAX_TAGS_PER_RECEIPT = 20;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v)) : value;

const NAME_MESSAGE = 'El nombre de la etiqueta debe tener entre 1 y 40 caracteres.';
const COLOR_MESSAGE = `El color debe ser uno de: ${RECEIPT_TAG_COLORS.join(', ')}.`;

/** Spec 051 H1 criterio 2. */
export class CreateReceiptTagDto {
  @Transform(trim)
  @IsString()
  @Length(1, 40, { message: NAME_MESSAGE })
  name!: string;

  @IsOptional()
  @IsIn(RECEIPT_TAG_COLORS, { message: COLOR_MESSAGE })
  color?: ReceiptTagColor | null;
}

/** Spec 051 H1 criterio 3: renombrar o cambiar el color (`null` lo quita). */
export class UpdateReceiptTagDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40, { message: NAME_MESSAGE })
  name?: string;

  @ValidateIf((dto: UpdateReceiptTagDto) => dto.color !== null && dto.color !== undefined)
  @IsIn(RECEIPT_TAG_COLORS, { message: COLOR_MESSAGE })
  color?: ReceiptTagColor | null;
}

/**
 * Spec 051 H1 criterios 1 y 5: las etiquetas de un ticket. `tagIds`, las ya
 * existentes; `newTags`, nombres que se crean al vuelo (o se reutilizan si
 * ya hay una con el mismo nombre). Sustituye las que tuviera.
 */
export class ReceiptTagsSelectionDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_RECEIPT)
  @IsUUID('all', { each: true })
  tagIds?: string[];

  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_RECEIPT)
  @IsString({ each: true })
  @Length(1, 40, { each: true, message: NAME_MESSAGE })
  newTags?: string[];
}
