import { Transform } from 'class-transformer';
import { IsDateString, IsString, MaxLength, ValidateIf } from 'class-validator';

/** Spec 051 H4: hasta 2000 caracteres. */
export const MAX_NOTE_LENGTH = 2000;

/** Una nota vacía o solo con espacios se guarda como "sin nota". */
export const normalizeNote = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Spec 051 H4 y H5: nota y fin de garantía de un ticket. Las dos son
 * opcionales: lo que no viene no cambia, y `null` lo quita.
 */
export class UpdateReceiptDetailsDto {
  @Transform(normalizeNote)
  @ValidateIf((dto: UpdateReceiptDetailsDto) => dto.note !== null && dto.note !== undefined)
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH, { message: `La nota no puede tener más de ${MAX_NOTE_LENGTH} caracteres.` })
  note?: string | null;

  @ValidateIf((dto: UpdateReceiptDetailsDto) => dto.warrantyUntil !== null && dto.warrantyUntil !== undefined)
  @IsDateString({ strict: true, strictSeparator: true }, { message: 'La fecha de fin de garantía no es válida.' })
  warrantyUntil?: string | null;
}
