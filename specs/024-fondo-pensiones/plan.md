# Plan — Spec 024 (Fondo Pensiones)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: tres tablas nuevas, mismo patrón en tres niveles que `cryptos`/`cryptoPurchases`/`cryptoValuations` (spec 022) pero sin cantidad ni precio por unidad — `pensionPlanContributions.amount` y `pensionPlanValuations.value` son importes directos.

```ts
export const pensionPlans = pgTable('pension_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  managingEntity: varchar('managing_entity', { length: 100 }).notNull(),
  plan: varchar('plan', { length: 150 }).notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('pension_plans_user_idx').on(table.userId)]);
// H1 criterio 2: "misma posición dos veces" se valida en PensionPlansService.create()/update()
// (409), no con una constraint SQL — mismo criterio que cryptos (spec 022).

export const pensionPlanContributions = pgTable('pension_plan_contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  pensionPlanId: uuid('pension_plan_id').notNull().references(() => pensionPlans.id, { onDelete: 'cascade' }),
  // H2 criterio 2: importe directo (IsMoneyAmount) — a diferencia de
  // cryptoPurchases, no hay quantity/purchasePrice por separado.
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  date: date('date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [
  index('pension_plan_contributions_plan_idx').on(table.pensionPlanId),
  index('pension_plan_contributions_plan_date_idx').on(table.pensionPlanId, table.date),
]);

export const pensionPlanValuations = pgTable('pension_plan_valuations', {
  id: uuid('id').defaultRandom().primaryKey(),
  pensionPlanId: uuid('pension_plan_id').notNull().references(() => pensionPlans.id, { onDelete: 'cascade' }),
  // H3 criterio 2: valor total directo, no precio por participación — no se
  // multiplica por ninguna cantidad (a diferencia de cryptoValuations.pricePerUnit).
  value: numeric('value', { precision: 12, scale: 2 }).notNull(),
  date: date('date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('pension_plan_valuations_plan_date_idx').on(table.pensionPlanId, table.date)]);
```

Ni `pensionPlanContributions` ni `pensionPlanValuations` llevan `userId` propio — aislamiento vía `pensionPlans.userId`, mismo criterio normalizado que `cryptoPurchases`/`cryptoValuations`.

Migración `CREATE TABLE` pura generada por `drizzle-kit generate` — sin datos previos que preservar.

## 2. Validación

Ningún decorador nuevo: `amount` y `value` son importes normales de hasta dos decimales, siempre positivos — `IsMoneyAmount`, ya existente, reutilizado tal cual (mismo criterio que `vehicles.purchasePrice`/`vehicleValuations.value`, spec 023).

## 3. Endpoints

Tres recursos nuevos, mismo patrón que `cryptos`/`crypto-purchases`/`crypto-valuations`:

- `GET/POST /pension-plans`, `PATCH/DELETE /pension-plans/:id`.
- `GET/POST /pension-plan-contributions`, `PATCH/DELETE /pension-plan-contributions/:id`.
- `GET/POST /pension-plan-valuations`, `PATCH/DELETE /pension-plan-valuations/:id`.

`PensionPlansService`: `create()`/`update()` comprueban unicidad (`managingEntity`+`plan` por usuario, 409); `remove()` deja el `ON DELETE CASCADE` de las dos tablas hijas. `PensionPlanContributionsService`/`PensionPlanValuationsService`: inyectan `PensionPlansService` y reutilizan su `findOwnOrThrow()` — mismo patrón que `CryptoPurchasesService`/`CryptoValuationsService`.

`WealthModule`: añade los tres controllers/services nuevos a la lista existente.

## 4. Cálculos

No se reutilizan `purchaseValue`/`currentValue` (son multiplicaciones precio × cantidad; aquí no hay cantidad). Una función nueva en `wealth.calculations.ts`:

```ts
export function totalContributions(contributions: Array<{ amount: string }>): string {
  return contributions.reduce((sum, c) => sum.plus(c.amount), new Decimal(0)).toFixed(2);
}
```

El "valor actual" de una posición es directamente `pensionPlanValuations.value` de su valoración más reciente — no hace falta ninguna función para calcularlo (a diferencia de `currentValue`). El % de ganancia/pérdida (H3 criterio 7) reutiliza `gainLossPercent`, ya existente en el frontend (`WealthPage.tsx`), tal cual — recibe dos importes, no le importa si el "coste" viene de `totalCost` o de `totalContributions`.

## 5. Frontend

- `api/pension-plans.ts`, `api/pension-plan-contributions.ts`, `api/pension-plan-valuations.ts` — mismo patrón que `api/cryptos.ts` y compañía.
- `WealthPage.tsx`: nueva sección "👴 Fondo Pensiones" con el mismo patrón en tres niveles que "Cripto" (posición → historial de aportaciones + historial de valoraciones anidados, alta en un solo paso posición+primera aportación, % de ganancia/pérdida en el título) pero sin campos de cantidad/precio — solo Importe en las aportaciones y Valor total en las valoraciones. Se retira `Fondo Pensiones` de `PLACEHOLDER_SECTIONS` (queda solo `Efectivo`).
- Tarjeta "Total": se añade un sexto sumando (`pensionPlansTotal`, mismo cálculo que `vehiclesTotal` — último valor conocido de cada posición, o 0) y una sexta cláusula en `canShowTotal`.
- Mismos `aria-label` distintivos en los 3 niveles de "Editar"/"Eliminar" que ya lleva "Cripto".

## 6. Fuera de este plan

- No se toca ninguna categoría ya implementada (Cuentas Bancarias, Acciones, Fondos Inversión, Cripto, Vehículos).
- No se generaliza `totalCost`/`totalCryptoCost` para aceptar el caso "sin cantidad" — `totalContributions` es una suma directa, ya lo bastante distinta como para no compensar forzar una abstracción compartida.
