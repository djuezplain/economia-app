import { pgTable, uuid, numeric, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';
import { categories } from './transactions.schema.js';

// --- Enums --------------------------------------------------------------

// spec 004, plan.md §1: un objetivo de ahorro no lleva categoría — es sobre
// el conjunto de ingresos/gastos del periodo (mismo dato que ya calcula
// `DashboardService.month()`/`.year()`, spec 002).
export const goalPeriodEnum = pgEnum('goal_period', ['MONTHLY', 'ANNUAL']);

// Compartido por `savings_goals` y `expense_budgets`: el valor objetivo es
// un importe fijo o un % de los ingresos del mismo periodo — ver
// `resolveTargetAmount` en `goals/goals-progress.calculations.ts`.
export const targetTypeEnum = pgEnum('target_type', ['AMOUNT', 'PERCENT']);

// --- Tables (ver spec 004, plan.md §1) -----------------------------------

export const savingsGoals = pgTable('savings_goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  period: goalPeriodEnum('period').notNull(),
  targetType: targetTypeEnum('target_type').notNull(),
  // `numeric`, nunca float/double — mismo criterio que `transactions.amount`
  // (spec 002): importe si `targetType: AMOUNT`, puntos porcentuales
  // (0-100) si `PERCENT`. Drizzle lo devuelve como `string`.
  targetValue: numeric('target_value', { precision: 12, scale: 2 }).notNull(),
  // H4 criterio 1 (spec.md): editable por el usuario, sin valor por defecto
  // fijado en el código — por eso no lleva `.default(...)` aquí tampoco.
  alertThresholdPercent: numeric('alert_threshold_percent', { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// H1 criterio 4 (spec.md): "un usuario no puede tener dos objetivos con el
// mismo period" se valida en `SavingsGoalsService.create()` (409), no con
// una constraint SQL — mismo criterio que las reglas de jerarquía de
// `CategoriesService` (plan.md §1: se mantiene la validación de negocio en
// un único sitio, el servicio, en vez de repartirla entre SQL y TypeScript).

export const expenseBudgets = pgTable('expense_budgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // `null` = presupuesto global (spec.md §4); si no es `null`, debe ser una
  // categoría de gasto de nivel superior propia del usuario (H2 criterio 5,
  // comprobado en `ExpenseBudgetsService.create()`, no aquí).
  // `onDelete: 'cascade'` — a diferencia de `transactions.category_id`
  // (`restrict`): un presupuesto no es un dato histórico que proteger, así
  // que borrar la categoría se lleva su presupuesto por delante en vez de
  // bloquear el borrado (plan.md §1).
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  targetType: targetTypeEnum('target_type').notNull(),
  targetValue: numeric('target_value', { precision: 12, scale: 2 }).notNull(),
  alertThresholdPercent: numeric('alert_threshold_percent', { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// H2 criterio 4 (spec.md): "un usuario no puede tener dos presupuestos con
// la misma categoría, ni dos globales" — mismo criterio de validación en
// servicio (no en SQL) que `savingsGoals` de arriba.

// --- Relations ------------------------------------------------------------

export const savingsGoalsRelations = relations(savingsGoals, ({ one }) => ({
  user: one(users, { fields: [savingsGoals.userId], references: [users.id] }),
}));

export const expenseBudgetsRelations = relations(expenseBudgets, ({ one }) => ({
  user: one(users, { fields: [expenseBudgets.userId], references: [users.id] }),
  category: one(categories, { fields: [expenseBudgets.categoryId], references: [categories.id] }),
}));
