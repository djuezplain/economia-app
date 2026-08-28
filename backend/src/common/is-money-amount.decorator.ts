import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * spec 002, plan.md §1: un importe siempre es positivo (el signo lo da el
 * tipo de movimiento, no el importe) y como mucho dos decimales — igual que
 * el `numeric(12,2)` de la columna. Se valida como `string` (no `number`),
 * consistente con cómo Drizzle representa `numeric` en JS (evitar el paso
 * por coma flotante binaria en cualquier punto, incluida la validación de
 * entrada).
 */
export const MONEY_AMOUNT_MESSAGE = 'El importe debe ser un número positivo con hasta dos decimales (p. ej. "12.50").';

const MONEY_AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

export function IsMoneyAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMoneyAmount',
      target: object.constructor,
      propertyName,
      options: { message: MONEY_AMOUNT_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && MONEY_AMOUNT_REGEX.test(value) && Number(value) > 0;
        },
      },
    });
  };
}
