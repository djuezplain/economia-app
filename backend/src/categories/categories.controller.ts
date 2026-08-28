import {
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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto.js';

/**
 * H3 (spec 002). Primera ruta real que aplica `RequireActiveUserGuard`
 * (spec 001, grupo 2, T2.2) además de `AuthGuard`: gestionar categorías es
 * ya una operación sobre datos económicos, así que una cuenta
 * `PENDING_VERIFICATION` recibe 403 aquí (H2 criterio 3 de la spec 001,
 * hasta ahora sin ninguna ruta real que lo ejercitara).
 */
@Controller('categories')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query() query: ListCategoriesQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.categories.list(req.user.id, query.type);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto, @Req() req: Request & { user: RequestUser }) {
    return this.categories.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.categories.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request & { user: RequestUser },
  ): Promise<void> {
    await this.categories.remove(req.user.id, id);
  }
}
