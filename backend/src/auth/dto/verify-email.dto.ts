import { Matches } from 'class-validator';

export class VerifyEmailQueryDto {
  @Matches(/^[a-f0-9]{64}$/, { message: 'Token con formato inválido.' })
  token!: string;
}
