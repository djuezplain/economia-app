import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * H6 criterio 1 (spec 033): un `multipart/form-data` solo manda texto —
 * `'true'` → `true`, cualquier otro valor (`'false'`, etc.) → `false`.
 * Un campo ausente ni siquiera llega a esta función (`class-transformer` no
 * invoca `@Transform` para una clave que no existe en el cuerpo recibido) —
 * se resuelve con el valor por defecto de la propia propiedad (`= true`),
 * comportamiento de H1-H5 antes de esta revisión para un cliente que no
 * manda estos 3 campos. Verificado explícitamente: sin este valor por
 * defecto, un `POST` sin estos campos fallaba con "must be a boolean value"
 * en vez de asumir "incluir todo".
 */
function toBoolean({ value }: { value: unknown }): boolean {
  return value === true || value === 'true';
}

/** H6 (spec 033, plan.md §15.1): qué historiales importar, junto al fichero. */
export class StockImportOptionsDto {
  @Transform(toBoolean)
  @IsBoolean()
  includePurchases: boolean = true;

  @Transform(toBoolean)
  @IsBoolean()
  includeSales: boolean = true;

  @Transform(toBoolean)
  @IsBoolean()
  includeValuations: boolean = true;
}
