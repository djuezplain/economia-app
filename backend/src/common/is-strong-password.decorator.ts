import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Política de contraseña de la constitution / spec 001 §4:
 * mínimo 10 caracteres, al menos una letra y un número.
 */
export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener al menos 10 caracteres, incluyendo una letra y un número.';

const STRONG_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: { message: PASSWORD_POLICY_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && STRONG_PASSWORD_REGEX.test(value);
        },
      },
    });
  };
}
