import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Spec 018 (Resumen Patrimonio), H2 criterio 3: variante de `IsMoneyAmount`
 * (is-money-amount.decorator.ts) que admite un signo "-" delante — un saldo
 * bancario puede estar en descubierto, a diferencia de `transactions.amount`
 * (spec 002), que siempre es positivo porque el signo lo da el tipo de
 * movimiento. Mismos dos decimales como mucho, mismo criterio de validar
 * como `string` (Drizzle representa `numeric` así, evita coma flotante).
 */
export const SIGNED_MONEY_AMOUNT_MESSAGE = 'El importe debe ser un número con hasta dos decimales (p. ej. "12.50" o "-12.50").';

const SIGNED_MONEY_AMOUNT_REGEX = /^-?\d+(\.\d{1,2})?$/;

export function IsSignedMoneyAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSignedMoneyAmount',
      target: object.constructor,
      propertyName,
      options: { message: SIGNED_MONEY_AMOUNT_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && SIGNED_MONEY_AMOUNT_REGEX.test(value);
        },
      },
    });
  };
}
