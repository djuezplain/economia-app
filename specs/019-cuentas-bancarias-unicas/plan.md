# Plan — Spec 019 (Cuentas bancarias únicas)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: `bankAccountEntries` (spec 018) se sustituye por dos tablas — `stockEntries` no se toca.

```ts
export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bank: varchar('bank', { length: 100 }).notNull(),
  accountNumber: varchar('account_number', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('bank_accounts_user_idx').on(table.userId)]);
// H1 criterio 2: "misma cuenta dos veces" se valida en BankAccountsService.create()
// (409), no con una constraint SQL — mismo criterio que savingsGoals (decisión 2).

export const bankAccountBalances = pgTable('bank_account_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  // `onDelete: 'cascade'` (a diferencia de `transactions.category_id`, que es
  // `restrict`): H1 criterio 4 pide explícitamente que borrar la cuenta se
  // lleve su historial por delante, no que lo bloquee.
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id, { onDelete: 'cascade' }),
  euros: numeric('euros', { precision: 12, scale: 2 }).notNull(),
  date: date('date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('bank_account_balances_account_date_idx').on(table.bankAccountId, table.date)]);
```

`bankAccountBalances` no lleva `userId` propio (normalizado, decisión 1) — el aislamiento por usuario se comprueba siempre a través de un `JOIN`/subconsulta contra `bankAccounts.userId` en el servicio.

## 2. Migración (decisión 3 — preservar datos ya desplegados)

`drizzle-kit generate` detecta el cambio de esquema y genera `CREATE TABLE bank_accounts`, `CREATE TABLE bank_account_balances` y `DROP TABLE bank_account_entries`. Se edita el SQL generado a mano para insertar, entre el `CREATE` y el `DROP`, la migración de datos:

```sql
INSERT INTO bank_accounts (id, user_id, bank, account_number, created_at, updated_at)
SELECT gen_random_uuid(), user_id, bank, account_number, min(created_at), max(updated_at)
FROM bank_account_entries
GROUP BY user_id, bank, account_number;

INSERT INTO bank_account_balances (id, bank_account_id, euros, date, created_at, updated_at)
SELECT gen_random_uuid(), ba.id, e.euros, e.date, e.created_at, e.updated_at
FROM bank_account_entries e
JOIN bank_accounts ba
  ON ba.user_id = e.user_id AND ba.bank = e.bank AND ba.account_number = e.account_number;
```

(`GROUP BY` en el primer `INSERT`: si spec 018 ya tiene varias filas con el mismo banco/cuenta — el caso normal, un histórico plano — se crea una única cuenta para todas ellas, con `created_at` de la entrada más antigua.)

## 3. Endpoints

Dos recursos nuevos, sustituyen a `/bank-account-entries` (spec 018) — se elimina ese controlador/servicio/DTOs por completo, no queda ninguna ruta antigua:

- `GET/POST /bank-accounts`, `PATCH/DELETE /bank-accounts/:id`
- `GET/POST /bank-account-balances`, `PATCH/DELETE /bank-account-balances/:id`

`BankAccountsService` (mismo patrón que `SavingsGoalsService`):
- `create()`: 409 si ya existe una cuenta con el mismo `bank`+`accountNumber` para ese usuario (H1 criterio 2).
- `update()`: si cambian `bank`/`accountNumber`, repite la misma comprobación de unicidad contra el resto de cuentas del usuario (excluyendo la propia).
- `remove()`: `ON DELETE CASCADE` en `bankAccountBalances` se encarga de borrar el historial (H1 criterio 4) — no hace falta borrarlo a mano en el servicio.

`BankAccountBalancesService` (`list`/`create`/`update`/`remove`):
- Todas las consultas pasan por `bankAccounts` para comprobar propiedad — `create()` comprueba que `bankAccountId` pertenece al usuario (404 si no, mismo criterio de "no revelar si existe" que el resto de la app) antes de insertar.
- `list()` devuelve las entradas de **todas** las cuentas del usuario (con su `bankAccountId`), ordenadas por fecha descendente (H2 criterio 4) — el frontend las agrupa por cuenta, no hace falta un parámetro de filtro por cuenta para esta spec.

DTOs: `CreateBankAccountDto`/`UpdateBankAccountDto` (`bank`, `accountNumber`, ambos opcionales en el update); `CreateBankAccountBalanceDto` (`bankAccountId` + `euros` + `date`), `UpdateBankAccountBalanceDto` (`euros`/`date` opcionales — `bankAccountId` no es editable: una entrada mal asignada se borra y se vuelve a crear en la cuenta correcta, no se "mueve").

## 4. Frontend

- Sustituye `api/bank-account-entries.ts` por `api/bank-accounts.ts` + `api/bank-account-balances.ts`.
- `WealthPage.tsx`, sección "Cuentas Bancarias": cada cuenta es un `<details>` anidado dentro de la sección (mismo patrón `.dashboard-section`, dos niveles de plegado) — colapsada muestra Banco + Número de Cuenta + el saldo más reciente; al maximizar, la lista de su historial (Fecha + Euros, editable/borrable una a una) y un formulario pequeño para añadir una nueva entrada de saldo (solo Euros + Fecha, con hoy por defecto). Un formulario aparte, al final de la sección, da de alta cuentas nuevas (Banco + Número de Cuenta).
- Mismo patrón de edición-in-line y borrado con estado `pendingDeleteId` ya usado en spec 018 para Acciones, aplicado ahora a dos niveles (cuenta, y saldo dentro de cada cuenta).

## 5. Fuera de este plan

- No se toca `stock-entries` (backend) ni la sección "Acciones" (frontend) — sin cambios respecto a spec 018.
- No se tocan las 5 categorías sin implementar.
