import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ConfirmReceiptDto } from '../receipt-import/dto/confirm-receipt.dto.js';
import { ListReceiptsQueryDto } from './dto/list-receipts-query.dto.js';
import { LinkTransactionDto } from './dto/link-transaction.dto.js';
import { ReceiptsService } from './receipts.service.js';
import { MAX_DOCUMENT_SIZE_BYTES, ReceiptDocumentsService } from './receipt-documents.service.js';
import { DocumentTooLargeFilter } from './document-too-large.filter.js';
import { ReceiptTagsSelectionDto } from './dto/receipt-tag.dto.js';
import { UpdateReceiptDetailsDto } from './dto/receipt-details.dto.js';
import { ReceiptTagsService } from './receipt-tags.service.js';

/**
 * Spec 034, plan.md §3 (H5, lectura) + spec 035, plan.md §1 (H1-H3,
 * escritura) — CRUD completo del recurso `/receipts` en un mismo
 * controller, mismo criterio que `StocksController` (spec 020): a
 * diferencia de la importación (`receipt-import`, un flujo de varios
 * pasos), editar/borrar un ticket ya guardado es CRUD simple sobre un
 * recurso ya identificado.
 */
@Controller('receipts')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ReceiptsController {
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly documents: ReceiptDocumentsService,
    private readonly tags: ReceiptTagsService,
  ) {}

  @Get()
  list(@Query() query: ListReceiptsQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.list(req.user.id, query);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.getById(req.user.id, id);
  }

  @Put(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ConfirmReceiptDto, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.update(req.user.id, id, dto);
  }

  /** Spec 051 H4 y H5: nota y fin de garantía. */
  @Patch(':id/details')
  updateDetails(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateReceiptDetailsDto, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.updateDetails(req.user.id, id, dto);
  }

  /** Spec 051 H1 criterio 1: sustituye las etiquetas del ticket, creando al vuelo las nuevas. */
  @Put(':id/tags')
  setTags(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ReceiptTagsSelectionDto, @Req() req: Request & { user: RequestUser }) {
    return this.tags.setForReceipt(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.receiptsService.remove(req.user.id, id);
  }

  // --- Spec 048 H1: documento original -----------------------------------

  /**
   * El binario con el tipo detectado al guardarlo, nunca uno declarado por el
   * cliente; `nosniff` para que el navegador no lo reinterprete. `no-store`:
   * es un dato financiero personal, no debe quedar en cachés intermedias.
   */
  @Get(':id/document')
  async getDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('download') download: string | undefined,
    @Req() req: Request & { user: RequestUser },
    @Res() res: Response,
  ): Promise<void> {
    const document = await this.documents.getContent(req.user.id, id);
    const disposition = download === '1' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': document.mimeType,
      'Content-Length': String(document.content.length),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(document.content);
  }

  /** H1 criterio 3: adjunta un documento a un ticket guardado o sustituye el que tenga. */
  @Put(':id/document')
  @UseFilters(DocumentTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  async putDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request & { user: RequestUser },
  ) {
    if (!file) throw new BadRequestException('Falta el documento (campo "file").');
    const prepared = await this.documents.prepare(file.buffer, file.originalname);
    return this.documents.replace(req.user.id, id, prepared);
  }

  /** Spec 051 H3 criterio 5: el texto reconocido del documento. */
  @Get(':id/document/text')
  getDocumentText(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.documents.getText(req.user.id, id);
  }

  /** Spec 051 H3 criterio 3: vuelve a leer el texto (una llamada a Vision). */
  @Post(':id/document/text')
  @HttpCode(HttpStatus.OK)
  readDocumentText(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.documents.readText(req.user.id, id);
  }

  @Delete(':id/document')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.documents.remove(req.user.id, id);
  }

  // --- Spec 048 H3: enlace con el movimiento -------------------------------

  @Get(':id/transaction-candidates')
  linkCandidates(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.linkCandidates(req.user.id, id);
  }

  @Put(':id/transaction')
  linkTransaction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LinkTransactionDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.receiptsService.linkTransaction(req.user.id, id, dto.transactionId);
  }

  @Delete(':id/transaction')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkTransaction(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.receiptsService.unlinkTransaction(req.user.id, id);
  }
}
