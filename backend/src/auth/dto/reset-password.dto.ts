import { Matches } from 'class-validator';
import { IsStrongPassword } from '../../common/is-strong-password.decorator.js';

export class ResetPasswordDto {
  @Matches(/^[a-f0-9]{64}$/, { message: 'Token con formato inválido.' })
  token!: string;

  @IsStrongPassword()
  password!: string;
}
