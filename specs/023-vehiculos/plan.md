# Plan — Spec 023 (Vehículos)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: dos tablas nuevas, mismo patrón en dos niveles que `bankAccounts`/`bankAccountBalances` (spec 019) — no el patrón en tres niveles de `stocks`/`stockPurchases`/`stockValuations` (spec 020), porque un vehículo no tiene "cantidad".

```ts
export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  brandModel: varchar('brand_model', { length: 150 }).notNull(),
  plate: varchar('plate', { length: 20 }).notNull(),
  // H1 criterio 1: fijados una sola vez al crear el vehículo, editables después
  // (H1 criterio 3) pero sin historial propio — a diferencia de stockPurchases,
  // no son un histórico aditivo.
  purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
  purchaseDate: date('purchase_date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('vehicles_user_idx').on(table.userId)]);
// H1 criterio 2: "mismo vehículo dos veces" se valida en VehiclesService.create()/update()
// (409), no con una constraint SQL — mismo criterio que bankAccounts (spec 019).

export const vehicleValuations = pgTable('vehicle_valuations', {
  id: uuid('id').defaultRandom().primaryKey(),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  // H2 criterio 2: siempre positivo (IsMoneyAmount, no IsSignedMoneyAmount como
  // bankAccountBalances.euros) — un vehículo no puede valer menos que 0.
  value: numeric('value', { precision: 12, scale: 2 }).notNull(),
  date: date('date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('vehicle_valuations_vehicle_date_idx').on(table.vehicleId, table.date)]);
```

`vehicleValuations` no lleva `userId` propio — aislamiento vía `vehicles.userId`, mismo criterio normalizado que `bankAccountBalances`.

Sin datos previos que preservar: migración `CREATE TABLE` pura generada por `drizzle-kit generate` en un solo paso.

## 2. Validación

Ningún decorador nuevo: `purchasePrice` y `value` son importes normales de hasta dos decimales, siempre positivos — `IsMoneyAmount` (`common/is-money-amount.decorator.ts`), ya existente, reutilizado tal cual (mismo criterio que `stockValuations.pricePerShare`). `purchaseDate`/`date` con `IsDateString`, mismo criterio que el resto de fechas de Resumen Patrimonio.

## 3. Endpoints

Dos recursos nuevos, mismo patrón que `bank-accounts`/`bank-account-balances`:

- `GET/POST /vehicles`, `PATCH/DELETE /vehicles/:id`.
- `GET/POST /vehicle-valuations`, `PATCH/DELETE /vehicle-valuations/:id`.

`VehiclesService`: `create()`/`update()` comprueban unicidad (`brandModel`+`plate` por usuario, 409); `remove()` deja el `ON DELETE CASCADE` de `vehicleValuations`. Mensajes en español propios ("Ya tienes registrado ese vehículo (misma marca/modelo y matrícula).", "Vehículo no encontrado.").
`VehicleValuationsService`: inyecta `VehiclesService` y reutiliza su `findOwnOrThrow()` — mismo patrón que `BankAccountBalancesService`.

`WealthModule`: añade los dos controllers/services nuevos a la lista existente.

## 4. Cálculos

No hace falta ninguna función nueva en `wealth.calculations.ts` (backend) — a diferencia de Acciones/Fondos/Cripto, aquí no hay `totalShares`/`purchaseValue`/`currentValue` que calcular: el valor actual de un vehículo es directamente el `value` de su valoración más reciente, sin multiplicar por ninguna cantidad. El % de ganancia/pérdida (H2 criterio 7) se calcula en el frontend con la misma fórmula que `gainLossPercent` ya existente en `WealthPage.tsx`, reutilizada tal cual (recibe dos importes, no le importa si el "coste" viene de `totalCost` o directamente de `purchasePrice`).

## 5. Frontend

- `api/vehicles.ts`, `api/vehicle-valuations.ts` — mismo patrón que `api/bank-accounts.ts`/`api/bank-account-balances.ts`.
- `WealthPage.tsx`: nueva sección "🚗 Vehículos" con el mismo patrón en dos niveles que "Cuentas Bancarias" (vehículo → historial de valoraciones anidado), más el % de ganancia/pérdida en el título (reutilizando `gainLossPercent`, ya existente). Se retira `Vehículos` de `PLACEHOLDER_SECTIONS`.
- Tarjeta "Total": se añade un quinto sumando (`vehiclesTotal`, mismo cálculo que `bankAccountsTotal` pero sobre el valor de la última valoración de cada vehículo en vez del último saldo de cada cuenta) y una quinta cláusula en `canShowTotal`.
- Mismos `aria-label` distintivos en los 2 niveles de "Editar"/"Eliminar" que ya lleva "Cuentas Bancarias".

## 6. Fuera de este plan

- No se toca `bank-accounts`/`bank-account-balances` (spec 019), `stocks`/`stock-purchases`/`stock-valuations` (spec 020), `funds`/`fund-purchases`/`fund-valuations` (spec 021) ni `cryptos`/`crypto-purchases`/`crypto-valuations` (spec 022).
- No se generaliza ningún cálculo o componente compartido entre Cuentas Bancarias y Vehículos más allá de lo descrito en §4.
