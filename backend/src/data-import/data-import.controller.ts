import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  ExceptionFilter,
  PayloadTooLargeException,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { DataImportService, MAX_ZIP_IMPORT_BYTES } from './data-import.service.js';

/** Spec 048 T6.3: el error de `multer` por tamaño (413, en inglés) se traduce a un 400 claro. */
@Catch(PayloadTooLargeException)
class ImportTooLargeFilter extends BaseExceptionFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    super.catch(new BadRequestException('El fichero ocupa más de 500 MB.'), host);
  }
}

/**
 * Spec 048 T6.3 (plan.md §3.4): el fichero se guarda en disco temporal, no en
 * memoria — un `.zip` con documentos puede ocupar cientos de MB en la
 * Raspberry Pi —, con nombre aleatorio para no depender del que mande el
 * cliente. El límite de `multer` es el del `.zip`; el de `.json` (10 MB,
 * como hasta ahora) lo aplica el servicio.
 */
const uploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({ destination: tmpdir(), filename: (_req, _file, cb) => cb(null, `economia-import-${randomUUID()}`) }),
  limits: { fileSize: MAX_ZIP_IMPORT_BYTES },
});

/** Spec 032 (H2). Mismo guard que el resto de rutas de datos económicos. */
@Controller('data-import')
@UseGuards(AuthGuard, RequireActiveUserGuard)
@UseFilters(ImportTooLargeFilter)
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @Post('preview')
  @UseInterceptors(uploadInterceptor)
  preview(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: RequestUser }) {
    return withTempFile(file, (upload) => this.dataImportService.preview(req.user.id, upload));
  }

  @Post('confirm')
  @UseInterceptors(uploadInterceptor)
  confirm(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: RequestUser }) {
    return withTempFile(file, (upload) => this.dataImportService.confirm(req.user.id, upload));
  }
}

/** Ejecuta `run` y borra el temporal siempre, también si falla. */
async function withTempFile<T>(file: Express.Multer.File | undefined, run: (upload: { path: string; originalname: string }) => Promise<T>): Promise<T> {
  if (!file) throw new BadRequestException('Falta el fichero a importar (campo "file").');
  try {
    return await run({ path: file.path, originalname: file.originalname });
  } finally {
    await rm(file.path, { force: true });
  }
}
