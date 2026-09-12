import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto.js';
import { ReceiptImportService } from './receipt-import.service.js';

/** plan.md §3: fotos de móvil modernas superan el límite de 10 MB ya usado para CSV/Excel. */
const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

/** Spec 034 (H1-H5). Mismo guard que el resto de rutas de datos económicos. */
@Controller('receipt-import')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ReceiptImportController {
  constructor(private readonly receiptImportService: ReceiptImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }))
  preview(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: RequestUser }) {
    assertImageFile(file);
    return this.receiptImportService.preview(req.user.id, file.buffer);
  }

  // plan.md §7: JSON, no multipart — no se vuelve a subir la imagen.
  @Post('confirm')
  confirm(@Body() dto: ConfirmReceiptDto, @Req() req: Request & { user: RequestUser }) {
    return this.receiptImportService.confirm(req.user.id, dto);
  }
}

function assertImageFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('Falta la imagen a importar (campo "file").');
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException('Solo se admiten imágenes JPEG o PNG.');
  }
}
