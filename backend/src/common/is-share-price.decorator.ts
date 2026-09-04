import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Spec 020 (revisión): precio de compra de una acción, positivo y con hasta
 * 8 decimales — a diferencia de `IsMoneyAmount` (2 decimales, para importes
 * en euros de movimientos/saldos/presupuestos), el precio de compra necesita
 * más precisión para posiciones muy fraccionadas (cripto-acciones, fondos
 * indexados fraccionarios, etc.) — mismo criterio de precisión que
 * `IsShareCount` para el número de acciones de la misma compra.
 */
export const SHARE_PRICE_MESSAGE = 'El precio de compra debe ser un número positivo con hasta 8 decimales (p. ej. "28.50").';

const SHARE_PRICE_REGEX = /^\d+(\.\d{1,8})?$/;

export function IsSharePrice(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSharePrice',
      target: object.constructor,
      propertyName,
      options: { message: SHARE_PRICE_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && SHARE_PRICE_REGEX.test(value) && Number(value) > 0;
        },
      },
    });
  };
}
