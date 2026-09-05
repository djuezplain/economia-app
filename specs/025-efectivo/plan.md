# Plan — Spec 025 (Efectivo)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: dos tablas nuevas, mismo patrón en dos niveles que `bankAccounts`/`bankAccountBalances` (spec 019), con un único campo identificativo en vez de dos.

```ts
export const cashHoldings = pgTable('cash_holdings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  location: varchar('location', { length: 150 }).notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('cash_holdings_user_idx').on(table.userId)]);
// H1 criterio 2: "misma ubicación dos veces" se valida en CashHoldingsService.create()/update()
// (409), no con una constraint SQL — mismo criterio que bankAccounts (spec 019).

export const cashBalances = pgTable('cash_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  cashHoldingId: uuid('cash_holding_id').notNull().references(() => cashHoldings.id, { onDelete: 'cascade' }),
  // H2 criterio 2: siempre positivo (IsMoneyAmount, no IsSignedMoneyAmount
  // como bankAccountBalances.euros) — el efectivo físico no puede ser negativo.
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  date: date('date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('cash_balances_holding_date_idx').on(table.cashHoldingId, table.date)]);
```

`cashBalances` no lleva `userId` propio — aislamiento vía `cashHoldings.userId`, mismo criterio normalizado que `bankAccountBalances`.

Migración `CREATE TABLE` pura generada por `drizzle-kit generate` — sin datos previos que preservar.

## 2. Validación

Ningún decorador nuevo: `amount` es un importe normal de hasta dos decimales, siempre positivo — `IsMoneyAmount`, ya existente, reutilizado tal cual (mismo criterio que `vehicles.purchasePrice`/`pensionPlanContributions.amount`).

## 3. Endpoints

Dos recursos nuevos, mismo patrón que `bank-accounts`/`bank-account-balances`:

- `GET/POST /cash-holdings`, `PATCH/DELETE /cash-holdings/:id`.
- `GET/POST /cash-balances`, `PATCH/DELETE /cash-balances/:id`.

`CashHoldingsService`: `create()`/`update()` comprueban unicidad (`location` por usuario, 409); `remove()` deja el `ON DELETE CASCADE` de `cashBalances`. `CashBalancesService`: inyecta `CashHoldingsService` y reutiliza su `findOwnOrThrow()` — mismo patrón que `BankAccountBalancesService`.

`WealthModule`: añade los dos controllers/services nuevos a la lista existente.

## 4. Cálculos

No hace falta ninguna función nueva en `wealth.calculations.ts` (backend): el valor de una ubicación es directamente el `amount` de su entrada más reciente, igual que `bankAccountBalances`. En el frontend, `cashTotal` (séptimo sumando) reutiliza el mismo patrón que `bankAccountsTotal`/`vehiclesTotal`: sumar el último importe conocido de cada ubicación, o 0 si no tiene ninguno.

## 5. Frontend

- `api/cash-holdings.ts`, `api/cash-balances.ts` — mismo patrón que `api/bank-accounts.ts`/`api/bank-account-balances.ts`.
- `WealthPage.tsx`: nueva sección "💵 Efectivo" con el mismo patrón en dos niveles que "Cuentas Bancarias" (ubicación → historial de importes anidado), sin % de ganancia/pérdida (spec.md §2: fuera de alcance, no hay "coste"). Se retira `Efectivo` de `PLACEHOLDER_SECTIONS`, que queda vacío — las 7 categorías de spec 018 quedan implementadas.
- Tarjeta "Total": se añade un séptimo sumando (`cashTotal`) y una séptima cláusula en `canShowTotal`.
- Mismos `aria-label` distintivos en los 2 niveles de "Editar"/"Eliminar" que ya lleva "Cuentas Bancarias".

## 6. Fuera de este plan

- No se toca ninguna categoría ya implementada.
- `PLACEHOLDER_SECTIONS` queda como array vacío tras esta spec, pero se mantiene en el código (no se elimina el `.map()` que lo renderiza) por si una categoría futura lo necesita — cambio trivial, no amerita retirar la infraestructura.
