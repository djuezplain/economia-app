import { BadRequestException, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ImportService } from './import.service.js';

/** plan.md §3: 10 MB, mismo límite en ambos endpoints. */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** H1/H2 (spec 003). Mismo guard que `/categories` y `/transactions`. */
@Controller('import/excel')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  preview(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: RequestUser }) {
    assertXlsxFile(file);
    return this.importService.preview(req.user.id, file.buffer);
  }

  @Post('confirm')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  confirm(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: RequestUser }) {
    assertXlsxFile(file);
    return this.importService.confirm(req.user.id, file.buffer);
  }
}

function assertXlsxFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('Falta el fichero a importar (campo "file").');
  }
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Solo se admiten ficheros .xlsx.');
  }
}
