# Plan — Spec 018 (Resumen Patrimonio)

**Fase:** 2 de 4

## 1. Modelo de datos

Nuevo fichero `backend/src/db/schema/wealth.schema.ts` (mismo criterio que `goals.schema.ts`: un fichero por dominio), dos tablas nuevas — nada que tocar en las ya existentes:

```ts
export const bankAccountEntries = pgTable('bank_account_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bank: varchar('bank', { length: 100 }).notNull(),
  accountNumber: varchar('account_number', { length: 50 }).notNull(),
  // H2 criterio 3: a diferencia de `transactions.amount`, admite negativo
  // (un descubierto) — por eso NO reutiliza `IsMoneyAmount` (backend/src/
  // common/is-money-amount.decorator.ts, exige > 0), sino un decorador
  // nuevo `IsSignedMoneyAmount` (§3).
  euros: numeric('euros', { precision: 12, scale: 2 }).notNull(),
  // `date`, no `timestamp` — mismo criterio que `transactions.date` (spec
  // 002): un dato sin hora, solo día.
  date: date('date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('bank_account_entries_user_date_idx').on(table.userId, table.date)]);

export const stockEntries = pgTable('stock_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  custodyBank: varchar('custody_bank', { length: 100 }).notNull(),
  stock: varchar('stock', { length: 150 }).notNull(),
  // H3 criterio 2: número de acciones puede ser fraccionario (brokers
  // modernos permiten comprar "0.5 acciones") — precisión a 4 decimales,
  // no 2, a diferencia de los importes en euros.
  shareCount: numeric('share_count', { precision: 14, scale: 4 }).notNull(),
  purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
  currentValuation: numeric('current_valuation', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('stock_entries_user_idx').on(table.userId)]);
```

`stockEntries` no lleva `date` propia (spec.md no la pide — a diferencia de `bankAccountEntries`, H3 no menciona fecha). `purchaseValue` (Precio compra × Número acciones, H3 criterio 2) **no se guarda**: se calcula en la función pura de cálculo (§2) y en el propio frontend al listar, igual que el resto de la app evita guardar derivados de otros campos (p. ej. `savingsAmount` en `dashboard.calculations.ts`).

Migración: `npx drizzle-kit generate` genera el SQL de las 2 tablas nuevas — sin tocar ninguna existente.

## 2. Cálculos puros

Nuevo fichero `backend/src/wealth/wealth.calculations.ts`, una única función:

```ts
export function purchaseValue(purchasePrice: string, shareCount: string): string {
  return new Decimal(purchasePrice).times(shareCount).toFixed(2);
}
```

Con su test unitario (`wealth.calculations.spec.ts`) — mismo criterio de la constitution §2 ("toda función de cálculo financiero lleva test unitario").

## 3. Validación

`backend/src/common/is-signed-money-amount.decorator.ts`, junto a `is-money-amount.decorator.ts` (mismo patrón, sin tocar el existente): admite un "-" opcional delante, hasta 2 decimales.

`backend/src/common/is-share-count.decorator.ts`: positivo, hasta 4 decimales (`shareCount`).

`Precio de compra`/`Valoración actual` reutilizan `IsMoneyAmount` tal cual (positivos, 2 decimales, ya existe).

## 4. Endpoints

Dos recursos independientes, mismo patrón que `SavingsGoalsController`/`ExpenseBudgetsController` (`goals.module.ts`):

- `GET/POST /bank-account-entries`, `PATCH/DELETE /bank-account-entries/:id`
- `GET/POST /stock-entries`, `PATCH/DELETE /stock-entries/:id`

`list()` en ambos servicios ordena por `date`/`createdAt` descendente (H2 criterio 4 — `stockEntries` no tiene `date`, se ordena por `createdAt`). Igual que `SavingsGoalsService`, cada método exige `userId` explícito y comprueba propiedad antes de editar/borrar (`findOwnOrThrow`, 404 si no es del usuario — nunca 403, mismo criterio ya establecido en el resto de la app para no revelar si el recurso existe).

Nuevo módulo `backend/src/wealth/wealth.module.ts` (`imports: [AuthGuardModule]`, sin depender de `DashboardModule` — a diferencia de `GoalsModule`, no hay ningún cálculo de progreso que reutilizar de otro módulo).

DTOs (`dto/create-bank-account-entry.dto.ts`, `update-...`, `create-stock-entry.dto.ts`, `update-...`): mismo patrón que `create-savings-goal.dto.ts` — `date` con `@IsDateString()` (o el mismo patrón `@Matches(/^\d{4}-\d{2}-\d{2}$/)` que ya usa `transactions`, a confirmar mirando `create-transaction.dto.ts` al implementar).

## 5. Frontend

- `frontend/src/api/bank-account-entries.ts`, `frontend/src/api/stock-entries.ts` — mismo patrón que `api/savings-goals.ts` (interfaces + `list`/`create`/`update`/`delete`).
- Nueva página `frontend/src/pages/WealthPage.tsx`, nueva ruta `/patrimonio` en `App.tsx`, nueva entrada `{ to: '/patrimonio', end: false, label: 'Resumen Patrimonio' }` en `NAV_ITEMS` de `AppLayout.tsx` (después de "Dashboard", antes de "Importar Excel" — mismo criterio de orden que el resto de la navegación financiera agrupada).
- 7 secciones `<details className="dashboard-section">` (reutiliza tal cual la clase de spec 016/017 — no es exclusiva del Dashboard, el nombre ya es genérico) con su icono (H1 criterio 2/spec.md decisión 3):
  - 🏦 Cuentas Bancarias, 📈 Acciones, 💹 Fondos Inversión, ₿ Cripto, 🚗 Vehículos, 👴 Fondo Pensiones, 💵 Efectivo.
- Cuentas Bancarias y Acciones: mismo patrón de "lista de `.card.elev-sm` + formulario de alta + edición in-line" ya usado en `GoalsPage.tsx` para presupuestos de gasto (formulario de alta al final de la lista, `editingId` para saber qué fila está en modo edición, confirmación de borrado con estado `pendingDeleteId` mientras se está eliminando).
  - Cuentas Bancarias: columnas Banco / Nº Cuenta / Euros / Fecha; el campo Fecha del formulario de alta se inicializa a `todayIso()` (ya existe en `home-shared.ts`/`DashboardPage.tsx`, se reutiliza o se extrae a un sitio común si hace falta en dos ficheros).
  - Acciones: columnas Banco Custodia / Acción / Nº acciones / Precio compra / Valor compra (calculado, solo lectura) / Valoración actual.
- Las 5 categorías sin implementar: mismo `<details>`, con un único `<p>` "Próximamente." dentro (H1 criterio 3) — sin formulario, sin llamada a ninguna API.

## 6. Fuera de este plan

- No se toca `dashboard.module.ts` ni ninguna spec anterior.
- No se añade ningún total agregado de patrimonio (spec.md §2).
- No se replica ninguna de estas dos secciones en modo offline (spec.md §2).
