# Plan — Spec 021 (Alias para cuentas bancarias)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: se añade una columna nullable a `bankAccounts` — no participa en la unicidad (spec 019, validada en el servicio, no con constraint SQL), así que no toca esa lógica.

```ts
export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bank: varchar('bank', { length: 100 }).notNull(),
  accountNumber: varchar('account_number', { length: 50 }).notNull(),
  alias: varchar('alias', { length: 100 }), // nullable — H1 criterio 1
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('bank_accounts_user_idx').on(table.userId)]);
```

## 2. Migración

`drizzle-kit generate` genera `ALTER TABLE bank_accounts ADD COLUMN alias varchar(100)`. No hace falta backfill (nullable, cuentas existentes quedan sin alias).

## 3. Backend

- `CreateBankAccountDto`: añade `alias?: string` (`@IsOptional() @IsString() @Length(0, 100)` — se permite cadena vacía como "sin alias").
- `UpdateBankAccountDto`: mismo campo opcional, para poder añadir/editar/quitar el alias de una cuenta ya creada (H1 criterio 2).
- `BankAccountsService`:
  - `create()`: guarda `alias` normalizado — cadena vacía o solo espacios se guarda como `null` (criterio 2, "quitar el alias" se expresa mandando `alias: ''`).
  - `update()`: mismo criterio de normalización cuando `dto.alias !== undefined`.
  - `assertNotDuplicate()` no cambia — sigue comparando solo `bank`+`accountNumber` (H1 criterio 4 de esta spec).

No cambia el controlador (`BankAccountsController`) ni ningún endpoint de `bank-account-balances`.

## 4. Frontend

- `api/bank-accounts.ts`: `BankAccount.alias: string | null`, `BankAccountInput.alias?: string`.
- `WealthPage.tsx`:
  - Nuevo helper `accountLabel(account)` → `` `${alias} (${bank} · ${accountNumber})` `` si tiene alias, si no `` `${bank} · ${accountNumber}` `` — se usa en los `aria-label` que hoy concatenan banco+número (edición, borrado, historial, formulario de saldo) para no perder contexto accesible.
  - Card de cada cuenta: si tiene alias, el `card-title` pasa a ser el alias y banco+número de cuenta baja a una línea `card-meta`; si no tiene alias, se mantiene como hoy (banco+número como `card-title`).
  - Formulario "Añadir cuenta" y formulario de edición: nuevo campo opcional "Alias" (texto libre) junto a Banco/Número de Cuenta.
  - `accountFormFromEntity()`: incluye `alias: account.alias ?? ''`.

## 5. Fuera de este plan

- No se toca `bank-account-balances` (servicio, controlador, frontend) — el alias vive únicamente en la cuenta.
- No se toca "Acciones" (spec 020).
