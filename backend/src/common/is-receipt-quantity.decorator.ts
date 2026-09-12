import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Spec 034: cantidad de una línea de ticket, positiva y con hasta 3
 * decimales — mismo criterio de un decorador dedicado por campo que
 * `IsShareCount`/`IsSharePrice` (spec 020), aunque comparta regex con
 * `IsReceiptUnitPrice`. 3 decimales porque el peso de fruta/verdura del
 * ticket real verificado en `spec.md` §1 trae hasta 3 (p. ej. "0,138 kg").
 */
export const RECEIPT_QUANTITY_MESSAGE = 'La cantidad debe ser un número positivo con hasta 3 decimales (p. ej. "2" o "0.138").';

const RECEIPT_QUANTITY_REGEX = /^\d+(\.\d{1,3})?$/;

export function IsReceiptQuantity(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isReceiptQuantity',
      target: object.constructor,
      propertyName,
      options: { message: RECEIPT_QUANTITY_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && RECEIPT_QUANTITY_REGEX.test(value) && Number(value) > 0;
        },
      },
    });
  };
}
