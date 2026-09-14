import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { ShoppingListsController } from './shopping-lists.controller.js';
import { ShoppingListsService } from './shopping-lists.service.js';

/** Spec 039, plan.md §2. */
@Module({
  imports: [AuthGuardModule],
  controllers: [ShoppingListsController],
  providers: [ShoppingListsService],
})
export class ShoppingListsModule {}
