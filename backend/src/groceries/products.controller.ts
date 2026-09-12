import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductsService } from './products.service.js';

/** Spec 034, plan.md §3 (H4) + spec 036, plan.md §1 (H2-H3). */
@Controller('products')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  search(@Query() query: ListProductsQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.productsService.search(req.user.id, query.search);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.productsService.getById(req.user.id, id);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateProductDto, @Req() req: Request & { user: RequestUser }) {
    return this.productsService.update(req.user.id, id, dto.name);
  }

  @Get(':id/prices')
  getPrices(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.productsService.getPrices(req.user.id, id);
  }
}
