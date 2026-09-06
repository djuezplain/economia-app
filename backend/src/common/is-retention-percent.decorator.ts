import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Spec 029, plan.md §2: % de retención de un dividendo, con hasta dos
 * decimales — a diferencia de `IsMoneyAmount` (positivo, sin límite
 * superior, pensado para importes en euros), un porcentaje de retención
 * tiene un rango de negocio distinto: `[0, 100)` (100% dejaría el importe
 * bruto sin definir, división entre cero en `grossDividend`). Decorador
 * propio en vez de reutilizar `IsMoneyAmount`, mismo criterio que
 * `IsSharePrice` frente a `IsMoneyAmount` (spec 020 §3.sexies).
 */
export const RETENTION_PERCENT_MESSAGE = 'El % de retención debe ser un número entre 0 y 100 (sin llegar a 100), con hasta dos decimales (p. ej. "19.00").';

const RETENTION_PERCENT_REGEX = /^\d{1,2}(\.\d{1,2})?$/;

export function IsRetentionPercent(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRetentionPercent',
      target: object.constructor,
      propertyName,
      options: { message: RETENTION_PERCENT_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && RETENTION_PERCENT_REGEX.test(value) && Number(value) >= 0 && Number(value) < 100;
        },
      },
    });
  };
}
