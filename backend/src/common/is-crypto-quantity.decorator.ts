import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Spec 022, H2 criterio 1: cantidad de una compra de cripto, positiva y con
 * hasta 8 decimales — mismo criterio de precisión que `IsShareCount`
 * (spec 020), pero con mensaje propio: reutilizar `IsShareCount` tal cual
 * mostraría "número de acciones" al validar un campo de cripto.
 */
export const CRYPTO_QUANTITY_MESSAGE = 'La cantidad debe ser un número positivo con hasta 8 decimales (p. ej. "0.5" o "1000").';

const CRYPTO_QUANTITY_REGEX = /^\d+(\.\d{1,8})?$/;

export function IsCryptoQuantity(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCryptoQuantity',
      target: object.constructor,
      propertyName,
      options: { message: CRYPTO_QUANTITY_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && CRYPTO_QUANTITY_REGEX.test(value) && Number(value) > 0;
        },
      },
    });
  };
}
