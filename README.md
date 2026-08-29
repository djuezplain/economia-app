# App de Gestión de Economía Personal

Sustituye el Excel "2026" de Diego por una aplicación web multiusuario (cada usuario con su economía aislada), con autenticación propia.

Este proyecto se desarrolla con **Spec Driven Development**: cada funcionalidad se especifica, se diseña y se desglosa en tareas antes de escribir código. Ver `specs/constitution.md` para el proceso completo y las decisiones técnicas fijas.

## Estructura

```
.
├── specs/
│   ├── constitution.md      # Principios y stack técnico del proyecto (no se repite en cada spec)
│   └── 001-auth/
│       ├── spec.md          # Qué debe hacer el feature — aprobada
│       ├── plan.md          # Diseño técnico — aprobado
│       └── tasks.md         # Tareas de implementación — en curso
├── docs/
│   └── requisitos_app_economia.md   # Documento de requisitos completo de toda la app
├── backend/                  # NestJS + TypeScript + Drizzle ORM + PostgreSQL
└── frontend/                 # React + TypeScript + Vite
```

## Poner en marcha el proyecto en local

Requiere Node.js 22+ y PostgreSQL 16 corriendo en local.

```bash
# 0) Postgres (si no está ya arrancado)
sudo service postgresql start
# la primera vez: crear el rol y las dos bases de datos (dev y test)
sudo -u postgres psql -c "CREATE USER economia_app WITH PASSWORD 'dev_password_local' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE economia_dev OWNER economia_app;"
sudo -u postgres psql -c "CREATE DATABASE economia_test OWNER economia_app;"

# 1) Backend
cd backend
cp .env.example .env       # y ajustar DATABASE_URL / secretos si hace falta
npm install
npx drizzle-kit migrate    # crea las tablas en economia_dev
npm run start:dev          # http://localhost:3000 — probar GET /health
npm run test                # unitarios (Vitest)
npm run test:e2e            # e2e contra economia_test (usa .env.test, no toca economia_dev)

# 2) Frontend (en otra terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
npm run test
```

## Estado actual

- [x] Documento de requisitos completo de la app
- [x] Constitution del proyecto (stack, principios)
- [x] Spec 001 (Auth) — aprobada, implementada y **cerrada** (checklist de cierre en `specs/001-auth/tasks.md`)
- [x] Spec 002 (Movimientos, categorías y dashboard) — aprobada, implementada y **cerrada** (checklist de cierre en `specs/002-movimientos-dashboard/tasks.md`): categorías (H3), ingresos y gastos (H1/H2) con desglose por categoría y subcategoría, dashboard mensual y anual (H4/H5)
- [x] Spec 003 (Importación del histórico desde el Excel "2026") — aprobada, implementada y **cerrada** (checklist de cierre en `specs/003-importacion-excel/tasks.md`): vista previa y confirmación de la importación (H1), reconocimiento de categorías y tipos de pago del Excel (H2), página `/import`
- [x] Spec 004 (Objetivos de ahorro y presupuestos de gasto) — aprobada, implementada y **cerrada** (checklist de cierre en `specs/004-objetivos-presupuestos/tasks.md`): objetivo de ahorro mensual/anual (H1), presupuestos de gasto global y por categoría (H2), progreso real con proyección de cierre de periodo (H3), aviso visual con umbral configurable por objetivo/presupuesto (H4), página `/goals`
- [x] Spec 005 (Navegación de la app) — aprobada, implementada y **cerrada** (checklist de cierre en `specs/005-navegacion/tasks.md`): menú lateral persistente en las 8 páginas autenticadas con sección activa distinguible y plegado/desplegable (H1), `HomePage` deja de duplicar la navegación (H2)
- [x] Spec 006 (Separar "Ingresos y gastos" en páginas independientes) — aprobada, implementada y **cerrada** (checklist de cierre en `specs/006-paginas-movimientos/tasks.md`): páginas independientes de Resumen, Movimientos y Registrar (H1) con sub-navegación propia (H2), edición de un movimiento existente preservada al separar las páginas (H3)
- [x] Spec 007 (Mejoras visuales) — aprobada, implementada y **cerrada** (checklist de cierre en `specs/007-mejoras-visuales/tasks.md`): código de color de 4 niveles en el progreso de objetivos/presupuestos (H1), gráficos con Recharts en el dashboard — ya implementados antes de esta spec, único añadido real: aviso de año sin movimientos (H2), barras de progreso en Objetivos (H3), espaciado y agrupación en formularios/tablas/listados (H4), iconos (`lucide-react`) en el menú lateral, accesibles también con el menú plegado (H5)
- [x] Spec 008 (Rediseño visual "Broadsheet") — aprobada, implementada y **cerrada** (checklist de cierre en `specs/008-rediseno-broadsheet/tasks.md`): tokens de color y tipografía de un rediseño hecho por Diego en el canvas de Diseño de Claude (H1), layout a ancho completo sin la columna centrada de 1126px (H2), Inicio rehecho con resumen del mes y últimos movimientos (H3), marca "Ledger" en el menú lateral (H4), punto de color en vez de iconos como indicador de sección activa — sustituye a `lucide-react`, retirada del proyecto (H5). Alcance acotado a lo que el mockup realmente tenía maquetado (solo la pantalla de Inicio); el resto de páginas solo heredan los tokens

Progreso detallado y checklist tarea a tarea de cada spec cerrada: `specs/001-auth/tasks.md`, `specs/002-movimientos-dashboard/tasks.md`, `specs/003-importacion-excel/tasks.md`, `specs/004-objetivos-presupuestos/tasks.md`, `specs/005-navegacion/tasks.md`, `specs/006-paginas-movimientos/tasks.md`, `specs/007-mejoras-visuales/tasks.md`, `specs/008-rediseno-broadsheet/tasks.md`.
