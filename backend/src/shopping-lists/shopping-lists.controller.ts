import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { AddShoppingListItemDto } from './dto/add-shopping-list-item.dto.js';
import { CreateShoppingListDto } from './dto/create-shopping-list.dto.js';
import { UpdateShoppingListDto } from './dto/update-shopping-list.dto.js';
import { ShoppingListsService } from './shopping-lists.service.js';

/** Spec 039, plan.md §2 (H1). */
@Controller('shopping-lists')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ShoppingListsController {
  constructor(private readonly shoppingLists: ShoppingListsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.shoppingLists.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateShoppingListDto, @Req() req: Request & { user: RequestUser }) {
    return this.shoppingLists.create(req.user.id, dto.name);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.shoppingLists.getById(req.user.id, id);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateShoppingListDto, @Req() req: Request & { user: RequestUser }) {
    return this.shoppingLists.update(req.user.id, id, dto.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.shoppingLists.remove(req.user.id, id);
  }

  @Post(':id/items')
  addItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddShoppingListItemDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.shoppingLists.addItem(req.user.id, id, dto.productId);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req: Request & { user: RequestUser },
  ): Promise<void> {
    await this.shoppingLists.removeItem(req.user.id, id, itemId);
  }
}
