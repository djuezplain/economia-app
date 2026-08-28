# Plan 002 — Ingresos, gastos y dashboard mensual

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan → Tasks → Implementación)
**Implementa:** `spec.md` (todas las historias H1–H5)
**Stack de referencia:** `specs/constitution.md` §3

## 1. Modelo de datos (Drizzle ORM / PostgreSQL)

Dos tablas nuevas, siguiendo el modelo unificado que ya proponía `docs/requisitos_app_economia.md` §8.3 (una tabla `Transaction` con un discriminador de tipo, en vez de dos tablas paralelas casi idénticas para ingresos y gastos) — así los totales y el dashboard agregan sobre una sola tabla en vez de tener que unir dos.

```ts
export const movementTypeEnum = pgEnum('movement_type', ['INCOME', 'EXPENSE']);

export const paymentMethodEnum = pgEnum('payment_method', [
  'CARD', 'DIRECT_DEBIT', 'CASH', 'TRANSFER',
]);

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: movementTypeEnum('type').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'restrict' }),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: movementTypeEnum('type').notNull(),
  date: date('date').notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  subcategoryId: uuid('subcategory_id').references(() => categories.id, { onDelete: 'restrict' }), // solo EXPENSE
  concept: varchar('concept', { length: 255 }).notNull(),
  merchant: varchar('merchant', { length: 255 }), // solo EXPENSE, texto libre (no es una entidad propia todavía — eso es 6.8, cashback, spec futura)
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method'), // solo EXPENSE
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Notas de diseño:
- **`amount` es `numeric(12,2)`, nunca `float`/`double`** — es dinero; usar coma flotante binaria acumularía errores de redondeo en los totales (constitution §2, "los cálculos financieros no llevan lógica a ojo"). Drizzle devuelve `numeric` como `string` en JS por la misma razón (evitar que el driver lo convierta a `number` y pierda precisión); las funciones de cálculo (§4) parsean con una librería decimal, no con `parseFloat` directo.
- **`categoryId`/`subcategoryId` usan `onDelete: 'restrict'`** (no `cascade`): borrar una categoría que ya tiene movimientos asociados debe fallar de forma explícita, no arrastrar ni huérfanar esos movimientos en silencio — ver §3 "Casos límite".
- **`date` es de tipo `date` de Postgres, no `timestamp`**: un movimiento no tiene hora, solo día (igual que en el Excel origen); evita además líos de zona horaria al agrupar por mes.
- **`categories.parentId` autorreferencia la misma tabla** (subcategorías, H3): sin límite de profundidad a nivel de esquema, pero la capa de servicio rechaza (400) crear una subcategoría bajo otra subcategoría — el plan (decisión 1) fija dos niveles como mucho.
- **No hay `merchants` como tabla propia todavía**: `transactions.merchant` es texto libre en esta spec. Cuando llegue el módulo de cashback (6.8 del documento, spec futura) que sí necesita un catálogo de comercios con % habitual, se planteará entonces si conviene normalizarlo — no se adelanta aquí para no acoplar specs que aún no existen.
- **`paymentMethod` es un enum fijo** (Tarjeta/Recibo/Efectivo/Transferencia), no una tabla editable por el usuario como las categorías: `spec.md` §4 los lista como "iniciales" sin pedir que sean editables (a diferencia de las categorías, que sí lo dice explícitamente) — se simplifica en consecuencia. Si en el futuro hiciera falta ampliarlo, es un cambio de enum, no una migración de modelo.

## 2. Endpoints (NestJS, sin prefijo global, igual que el resto de la app — ver `constitution.md` §3)

| Método y ruta | Guard | Descripción |
|---|---|---|
| `GET /categories?type=` | `AuthGuard`, `RequireActiveUserGuard` | H3. Lista las categorías propias (opcionalmente filtradas por tipo), incluidas las semillas y las creadas por el usuario. |
| `POST /categories` | ídem | H3 criterio 2. Body: `type`, `name`, `parentId?` (solo válido si `type=EXPENSE` y el padre es una categoría propia sin padre). |
| `PATCH /categories/:id` | ídem | Renombrar una categoría propia. |
| `DELETE /categories/:id` | ídem | Borra una categoría propia — falla (409) si tiene movimientos asociados o subcategorías propias (ver casos límite). |
| `POST /transactions` | ídem | H1/H2. Body: `type`, `date`, `categoryId`, `subcategoryId?`, `concept`, `merchant?`, `amount`, `paymentMethod?`. Los campos marcados `?` solo se aceptan (y se validan) si `type=EXPENSE`. |
| `GET /transactions` | ídem | H1/H2 criterio 3. Filtros por query: `type`, `dateFrom`, `dateTo`, `categoryId`, `subcategoryId`, `merchant`, `q` (texto libre sobre `concept`, `ILIKE '%...%'`), paginado (`page`, `limit`). |
| `PATCH /transactions/:id` | ídem | Edición parcial de un movimiento propio. |
| `DELETE /transactions/:id` | ídem | Borra un movimiento propio (borrado físico inmediato, ver `spec.md` decisión 3). |
| `GET /dashboard/month?month=YYYY-MM` | ídem | H4. Resumen del mes indicado (por defecto, el mes en curso): totales, ahorro, % ahorro, desglose de gastos por categoría, medias diarias. |
| `GET /dashboard/year?year=YYYY` | ídem | H5. Evolución mes a mes del año indicado (por defecto, el año en curso) + acumulados anuales. |

Todas las rutas nuevas llevan `@UseGuards(AuthGuard, RequireActiveUserGuard)` — es exactamente el caso para el que `RequireActiveUserGuard` se dejó listo y sin usar en el grupo 2 de la spec 001 ("bloquea cualquier ruta futura de datos económicos si `status != ACTIVE`"). Cierra el círculo de H2 criterio 3 de la spec 001: con estas rutas ya existiendo, una cuenta `PENDING_VERIFICATION` recibe 403 al intentar crear o ver movimientos, no solo el aviso informativo del frontend.

## 3. Autorización y aislamiento (constitution §2, spec.md §3)

- Igual que en la spec 001: ningún método de `CategoriesService`/`TransactionsService` acepta una consulta sin `userId` explícito en la firma — no existe un "buscar por id" que no filtre por dueño.
- `POST /transactions` valida que `categoryId` (y `subcategoryId`, si se manda) pertenezcan al usuario autenticado y sean del `type` correcto — si el cliente manda el id de una categoría de otro usuario (o de un tipo que no encaja), se trata igual que "no existe" (404), no como "prohibido" (403), siguiendo el mismo criterio ya usado en `DELETE /users/me/sessions/:id` (spec 001, grupo 6): no confirmar la existencia de un recurso ajeno.
- Test de contrato de aislamiento obligatorio (mismo patrón que `test/auth-isolation.e2e-spec.ts` de la spec 001): usuario A nunca puede leer, editar, eliminar ni referenciar en un movimiento propio una categoría de un usuario B, y viceversa.

## 4. Cálculos automáticos — funciones puras con test unitario (constitution §2)

Viven en `dashboard/dashboard.calculations.ts` (o equivalente), sin acceso a base de datos — reciben la lista de movimientos ya cargada y devuelven números:

- `sumByType(transactions, type)` — total de ingresos o gastos de un conjunto de movimientos.
- `average(total, days)` — media diaria. **Decisión de plan:** para el mes en curso, `days` es el número de días transcurridos del mes (1 hasta hoy), no el total de días del mes — dividir por el mes completo infravaloraría la media mientras el mes no ha terminado. Para un mes ya cerrado (consultado con `?month=` de un mes anterior), `days` es el total de días de ese mes. Esta distinción se prueba explícitamente con un test (mes en curso vs. mes cerrado).
- `savingsPercent(income, expense)` — `(income − expense) / income`. **Devuelve `null` si `income` es 0** (spec.md §4: "sin datos", no división por cero ni 0% engañoso) — el frontend decide cómo mostrar ese `null` (p. ej. "—").
- `groupByCategory(transactions)` — total de gasto por categoría, para el desglose de H4 criterio 2.
- `monthlyEvolution(transactions, year)` — array de 12 entradas (una por mes) con ingresos/gastos/ahorro de cada una, para H5 criterio 1.
- Todas usan una librería de decimales (p. ej. `decimal.js`, ya que `amount` llega como `string` desde Drizzle — ver §1) en vez de aritmética de `number` nativa, para no reintroducir el problema de precisión que se evitó eligiendo `numeric` en la base de datos.

## 5. Semillas de categorías (H3 criterio 1)

- Al registrarse un usuario (`AuthService.register`, spec 001), se crean automáticamente sus categorías iniciales (`isDefault: true`) listadas en `spec.md` §4 — 10 de ingreso, 12 de gasto (sin subcategorías propias en la semilla; el usuario puede añadirlas si quiere).
- Esto requiere que `AuthModule` importe `CategoriesModule` directamente (mismo patrón ya establecido en la spec 001 para `MailModule`/`JwtModule`/`AuditModule` — ver `constitution.md` §3, "se importa directamente, no se encadena vía re-exports").
- Las categorías por defecto no tienen ningún tratamiento especial más allá de `isDefault: true` de cara al usuario — se pueden renombrar o borrar igual que las propias (sujeto a la misma regla de "no se puede borrar si tiene movimientos", §1).

## 6. Casos límite a cubrir con tests

- Crear un movimiento con `categoryId`/`subcategoryId` de otro usuario → 404 (no 403), igual que el resto de recursos ajenos en esta app.
- Crear un movimiento `INCOME` con `subcategoryId`, `merchant` o `paymentMethod` informados → 400 (esos campos no aplican a ingresos).
- Crear un movimiento `EXPENSE` con una `subcategoryId` que no sea hija de la `categoryId` indicada, o que sea de tipo `INCOME` → 400.
- Borrar una categoría con movimientos asociados → 409, no borra nada.
- Borrar una categoría que tiene subcategorías propias → 409 (hay que borrar las subcategorías primero).
- `GET /dashboard/month` con ingresos = 0 en ese mes → `savingsPercent: null`, no error ni `NaN`.
- `GET /dashboard/month` de un mes sin ningún movimiento → todos los totales a 0, no un error 404 (un mes "vacío" es un estado válido, no un recurso que no existe).
- Cuenta `PENDING_VERIFICATION` intenta crear o listar movimientos/categorías → 403 (`RequireActiveUserGuard`), cerrando el hueco ya anotado en la spec 001 (H2 criterio 3).
- Filtro de fechas con `dateFrom` posterior a `dateTo` → 400 (rango inválido), no una lista vacía silenciosa.

## 7. Fuera de este plan

Todo lo ya listado como fuera de alcance en `spec.md` §5 (recurrentes, objetivos/presupuestos, patrimonio, inversiones, cashback, comparativa interanual, importación del Excel, exportación CSV/PDF, multidivisa) queda igualmente fuera del diseño técnico — no se dejan columnas ni tablas "por si acaso" para esos módulos futuros, ya que cada uno tendrá su propia spec y plan cuando le toque.

---
**Siguiente paso:** revisar este plan (modelo de datos, endpoints, decisiones de cálculo) y aprobarlo. Al aprobarlo, se genera `tasks.md` con el desglose en tareas implementables una a una.
