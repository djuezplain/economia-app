import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Spec 018 (Resumen Patrimonio), H3 criterio 2: número de acciones, positivo
 * y con hasta 8 decimales (no 2, a diferencia de un importe en euros) — los
 * brokers modernos permiten comprar acciones fraccionarias, con la
 * precisión que pide spec 020 (revisión) para posiciones muy fraccionadas
 * (cripto-acciones, fondos indexados fraccionarios, etc.).
 */
export const SHARE_COUNT_MESSAGE = 'El número de acciones debe ser positivo, con hasta 8 decimales (p. ej. "10" o "0.5").';

const SHARE_COUNT_REGEX = /^\d+(\.\d{1,8})?$/;

export function IsShareCount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isShareCount',
      target: object.constructor,
      propertyName,
      options: { message: SHARE_COUNT_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && SHARE_COUNT_REGEX.test(value) && Number(value) > 0;
        },
      },
    });
  };
}
