import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Spec 048 H1 criterio 8: cuando `multer` corta una subida por superar el
 * límite responde 413 con "File too large", en inglés. En las rutas de
 * documentos se traduce a un 400 claro, igual que el resto de validaciones.
 */
@Catch(PayloadTooLargeException)
export class DocumentTooLargeFilter extends BaseExceptionFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    super.catch(new BadRequestException('El documento ocupa más de 10 MB.'), host);
  }
}
