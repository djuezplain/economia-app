import { BadRequestException, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { DataImportService } from './data-import.service.js';

/** Plan.md §3: mismo límite que `ImportController` (import/excel). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Spec 032 (H2). Mismo guard que el resto de rutas de datos económicos. */
@Controller('data-import')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  preview(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: RequestUser }) {
    assertJsonFile(file);
    return this.dataImportService.preview(req.user.id, file.buffer);
  }

  @Post('confirm')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  confirm(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: RequestUser }) {
    assertJsonFile(file);
    return this.dataImportService.confirm(req.user.id, file.buffer);
  }
}

function assertJsonFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('Falta el fichero a importar (campo "file").');
  }
  if (!file.originalname.toLowerCase().endsWith('.json')) {
    throw new BadRequestException('Solo se admiten ficheros .json.');
  }
}
