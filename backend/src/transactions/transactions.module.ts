import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

/**
 * Solo necesita `AuthGuardModule` (por `AuthGuard`) — la validación de
 * categorías/subcategorías consulta la tabla `categories` directamente vía
 * `DB` (global), sin depender de `CategoriesModule`: no hace falta otra
 * relación entre módulos de negocio para esto (ver la nota sobre el ciclo
 * `AuthModule` ⇄ `CategoriesModule` en `constitution.md`, grupo 1). Exporta
 * `TransactionsService` para que el dashboard (grupo 3) lo reutilice.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
