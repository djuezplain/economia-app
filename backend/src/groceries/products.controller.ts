import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductsService } from './products.service.js';

/** Spec 034, plan.md §3. */
@Controller('products')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  search(@Query() query: ListProductsQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.productsService.search(req.user.id, query.search);
  }

  @Get(':id/prices')
  getPrices(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.productsService.getPrices(req.user.id, id);
  }
}
