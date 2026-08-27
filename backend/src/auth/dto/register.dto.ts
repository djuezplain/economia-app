import { IsEmail, IsString, Length } from 'class-validator';
import { IsStrongPassword } from '../../common/is-strong-password.decorator.js';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsStrongPassword()
  password!: string;

  @IsString()
  @Length(1, 255)
  name!: string;
}
