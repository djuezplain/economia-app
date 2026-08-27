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
- [x] Spec 001 (Auth) — aprobada
- [x] Plan 001 (Auth) — aprobado
- [x] Tasks 001 (Auth) — 24 tareas en 10 grupos
- [~] Implementación 001 (Auth) — **en curso**: grupo 0 (infraestructura) ✅, grupo 1 (Registro, H1) ✅, grupo 2 (Verificación de email, H2) ✅, grupo 3 (Login y sesiones, H4) siguiente

Progreso detallado y checklist tarea a tarea: `specs/001-auth/tasks.md`.
