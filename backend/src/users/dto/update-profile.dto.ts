import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * H7 (spec 001), criterio 1: solo nombre, moneda por defecto e idioma. El
 * email queda deliberadamente fuera de este DTO — cambiarlo tendría
 * implicaciones propias (reverificación, colisión con otra cuenta...) que la
 * spec no pide resolver aquí. Gracias a `forbidNonWhitelisted` en el
 * `ValidationPipe` global, un intento de mandar `email` en este PATCH falla
 * con 400 en vez de ser ignorado en silencio.
 *
 * Todos los campos son opcionales (PATCH parcial): se puede actualizar solo
 * el nombre, solo la moneda, o cualquier combinación, en una sola llamada.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  // Código ISO 4217 de 3 letras mayúsculas (EUR, USD, GBP...). No se limita a
  // una lista cerrada de monedas — la spec no la fija — pero sí al formato.
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'La moneda debe ser un código de 3 letras mayúsculas (p. ej. EUR).' })
  currency?: string;

  // BCP-47 simplificado: "es", "en", "es-ES"... coherente con el límite de
  // 10 caracteres de la columna `locale` en el esquema.
  @IsOptional()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/, { message: 'El idioma debe tener el formato "es" o "es-ES".' })
  locale?: string;
}
