import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

/**
 * Solo necesita `AuthGuardModule` (por `AuthGuard`) — la validación de
 * categorías/subcategorías consulta la tabla `categories` directamente vía
 * `DB` (global), sin depender de `CategoriesModule`: no hace falta otra
 * relación entre módulos de negocio para esto (ver la nota sobre el ciclo
 * `AuthModule` ⇄ `CategoriesModule` en `constitution.md`, grupo 1).
 *
 * `TransactionsService` se sigue exportando por si algún consumidor futuro
 * lo necesita, pero el dashboard (grupo 3) NO pasa por aquí: consulta
 * `transactions` directamente vía `DB`, igual que este propio servicio —
 * ver la nota en `dashboard/dashboard.service.ts`. `list()` está pensado
 * para el listado paginado de la UI (su `summary` mezcla ingresos y gastos
 * en un único total), no encaja con lo que necesita el dashboard.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
