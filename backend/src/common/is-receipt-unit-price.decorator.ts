import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Spec 034: precio por unidad o por kg de una línea de ticket (H4 criterio
 * 4) — positivo, hasta 3 decimales (el ticket real trae precios/kg como
 * "1,55 €/kg", verificado en `spec.md` §1). Distinto de `IsMoneyAmount`
 * (2 decimales, para el importe total de la línea) por el mismo motivo que
 * separa `IsShareCount` de `IsMoneyAmount` en spec 020: campos con
 * significado distinto, aunque uno pueda derivarse del otro.
 */
export const RECEIPT_UNIT_PRICE_MESSAGE = 'El precio por unidad debe ser un número positivo con hasta 3 decimales (p. ej. "1.55").';

const RECEIPT_UNIT_PRICE_REGEX = /^\d+(\.\d{1,3})?$/;

export function IsReceiptUnitPrice(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isReceiptUnitPrice',
      target: object.constructor,
      propertyName,
      options: { message: RECEIPT_UNIT_PRICE_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && RECEIPT_UNIT_PRICE_REGEX.test(value) && Number(value) > 0;
        },
      },
    });
  };
}
