# App de Gestión de Economía Personal

Sustituye el Excel "2026" de Diego por una aplicación web multiusuario (cada usuario con su economía aislada), con autenticación propia.

Este proyecto se desarrolla con **Spec Driven Development**: cada funcionalidad se especifica, se diseña y se desglosa en tareas antes de escribir código. Ver `specs/constitution.md` para el proceso completo y las decisiones técnicas fijas.

## Estructura

```
.
├── specs/
│   ├── constitution.md      # Principios y stack técnico del proyecto (no se repite en cada spec)
│   └── 001-auth/
│       ├── spec.md          # Qué debe hacer el feature (aprobar antes de seguir)
│       ├── plan.md          # (siguiente fase) Diseño técnico
│       └── tasks.md         # (siguiente fase) Tareas de implementación
├── docs/
│   └── requisitos_app_economia.md   # Documento de requisitos completo de toda la app
├── frontend/                 # (a crear en la fase de implementación)
└── backend/                  # (a crear en la fase de implementación)
```

## Estado actual

- [x] Documento de requisitos completo de la app
- [x] Constitution del proyecto (stack, principios)
- [x] Spec 001 (Auth) — aprobada
- [x] Plan 001 (Auth) — aprobado
- [x] Tasks 001 (Auth) — listo, 24 tareas en 10 grupos
- [ ] Implementación 001 (Auth) — **pendiente de empezar**
