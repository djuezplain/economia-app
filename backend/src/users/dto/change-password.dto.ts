import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/is-strong-password.decorator.js';

/**
 * H7 (spec 001), criterio 2: cambiar la contraseña estando autenticado exige
 * confirmar la contraseña actual (a diferencia de `POST /auth/reset-password`,
 * grupo 5, que la sustituye por posesión de un token de un solo uso enviado
 * por email — dos formas distintas de probar identidad, no la misma ruta).
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsStrongPassword()
  newPassword!: string;
}
