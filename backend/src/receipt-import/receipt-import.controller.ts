import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ConfirmImportReceiptDto } from './dto/confirm-receipt.dto.js';
import { ReceiptImportService } from './receipt-import.service.js';
import { MAX_DOCUMENT_SIZE_BYTES } from '../groceries/receipt-documents.service.js';
import { DocumentTooLargeFilter } from '../groceries/document-too-large.filter.js';

/**
 * plan.md §2 (nota de implementación — cambio de motor a Google Cloud
 * Vision): la imagen viaja codificada en base64 dentro del cuerpo JSON de
 * la petición a Vision (~33% de overhead sobre el tamaño original) — 10 MB
 * de foto quedan en ~13,3 MB codificados, con margen cómodo. Spec 048: el
 * mismo límite vale para cualquier documento (foto o PDF), y el tipo ya no
 * se comprueba aquí con lo que declara el navegador, sino en
 * `ReceiptDocumentsService.prepare` por los primeros bytes.
 */

/** Spec 034 (H1-H5). Mismo guard que el resto de rutas de datos económicos. */
@Controller('receipt-import')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ReceiptImportController {
  constructor(private readonly receiptImportService: ReceiptImportService) {}

  @Post('preview')
  @UseFilters(DocumentTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  preview(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: RequestUser }) {
    if (!file) throw new BadRequestException('Falta el documento a importar (campo "file").');
    return this.receiptImportService.preview(req.user.id, file.buffer, file.originalname);
  }

  // plan.md §7: JSON, no multipart — no se vuelve a subir la imagen (spec
  // 048: el documento ya se guardó en la vista previa; llega su `documentId`).
  @Post('confirm')
  confirm(@Body() dto: ConfirmImportReceiptDto, @Req() req: Request & { user: RequestUser }) {
    return this.receiptImportService.confirm(req.user.id, dto);
  }
}
