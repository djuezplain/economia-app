import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * H8 (spec 001), criterio 2: "reintroducir contraseña o email". Se interpreta
 * como una alternativa según lo que la cuenta tenga disponible, no como que
 * el cliente elija libremente entre las dos:
 * - Si la cuenta tiene contraseña (la inmensa mayoría), se exige `password`
 *   — es el factor más fuerte de los dos disponibles.
 * - Si la cuenta se creó solo vía Google (grupo 4, sin `passwordHash`), no
 *   hay contraseña que confirmar — mismo caso que en `change-password`
 *   (grupo 7) — así que se exige `confirmEmail` en su lugar.
 *
 * Ambos campos son opcionales a nivel de DTO porque cuál se exige depende
 * del tipo de cuenta; `UsersService.deleteAccount` decide cuál corresponde y
 * rechaza con un mensaje claro si falta el que tocaba.
 */
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @IsOptional()
  @IsEmail()
  confirmEmail?: string;
}
