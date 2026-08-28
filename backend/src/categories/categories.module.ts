import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

/**
 * Importa `AuthGuardModule` (no `AuthModule`) por `AuthGuard`: `AuthModule`
 * necesita `CategoriesService` para sembrar categorías al registrarse
 * (T1.3), así que si `CategoriesModule` importara `AuthModule` de vuelta se
 * cerraría un ciclo — ver el comentario de `AuthGuardModule` para el
 * porqué completo. `CategoriesService` se exporta para que `AuthModule` lo
 * use.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
