import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Spec 022, H2 criterio 1 / H3 criterio 2: precio de una compra o valoración
 * de cripto, positivo y con hasta 8 decimales — a diferencia de
 * `IsMoneyAmount` (2 decimales, usado en `stockValuations.pricePerShare`),
 * muchas altcoins cotizan por debajo de 1 céntimo. Usado tanto en
 * `purchasePrice` como en `pricePerUnit`: ambos son "un precio positivo con
 * hasta 8 decimales", no hace falta un decorador distinto para cada uno.
 */
export const CRYPTO_PRICE_MESSAGE = 'El precio debe ser un número positivo con hasta 8 decimales (p. ej. "0.00003821").';

const CRYPTO_PRICE_REGEX = /^\d+(\.\d{1,8})?$/;

export function IsCryptoPrice(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCryptoPrice',
      target: object.constructor,
      propertyName,
      options: { message: CRYPTO_PRICE_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && CRYPTO_PRICE_REGEX.test(value) && Number(value) > 0;
        },
      },
    });
  };
}
