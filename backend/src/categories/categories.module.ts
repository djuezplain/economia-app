import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

/**
 * `AuthModule` se importa directamente por `AuthGuard` (mismo patrón que
 * `UsersModule`, spec 001) — `CategoriesService` se exporta para que otros
 * módulos puedan usarlo (T1.3: sembrar categorías por defecto al
 * registrarse).
 */
@Module({
  imports: [AuthModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
