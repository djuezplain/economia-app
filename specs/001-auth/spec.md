# Spec 001 — Autenticación y gestión de usuarios

**Estado:** Borrador — pendiente de aprobación
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** `docs/requisitos_app_economia.md`, secciones 4 y 5 (RF-U1 a RF-U15)

## 1. Por qué

Es el primer feature del proyecto porque todo lo demás (ingresos, gastos, inversiones...) depende de que exista un usuario autenticado al que atribuir los datos, y del aislamiento de datos entre usuarios exigido por la constitution.

## 2. Historias de usuario

**H1 — Registro**
Como visitante, quiero crear una cuenta con email y contraseña, para poder empezar a registrar mi economía personal.

- Criterio de aceptación 1: dado un email no registrado y una contraseña que cumple la política mínima, cuando envío el formulario de registro, entonces se crea la cuenta en estado "pendiente de verificación" y recibo un email con un enlace de verificación.
- Criterio de aceptación 2: dado un email ya registrado, cuando intento registrarme con ese email, entonces recibo un error claro sin revelar si la cuenta existe con detalle que facilite enumeración de usuarios.
- Criterio de aceptación 3: dada una contraseña que no cumple la política mínima (ver sección 4), cuando envío el formulario, entonces veo el motivo exacto del rechazo antes de enviarlo (validación en cliente) y el servidor la rechaza igualmente si el cliente se salta la validación.

**H2 — Verificación de email**
Como usuario recién registrado, quiero verificar mi email, para activar completamente mi cuenta.

- Criterio de aceptación 1: al pulsar el enlace de verificación recibido por email, mi cuenta pasa a estado "activa".
- Criterio de aceptación 2: un enlace de verificación caduca a las 24 horas; pasado ese tiempo puedo solicitar que se reenvíe.
- Criterio de aceptación 3: mientras mi cuenta no esté verificada, puedo iniciar sesión pero no puedo crear ni ver datos económicos (ingresos, gastos, etc.) — solo veo un aviso pidiéndome verificar el email.

**H3 — Registro/login con Google**
Como visitante, quiero registrarme o iniciar sesión con mi cuenta de Google, para no tener que crear ni recordar otra contraseña.

- Criterio de aceptación 1: si uso "Continuar con Google" y el email de esa cuenta de Google no existe aún en la aplicación, se crea una cuenta nueva ya verificada (Google ya verificó ese email).
- Criterio de aceptación 2: si ese email ya existe como cuenta registrada por contraseña, se vincula el login de Google a la cuenta existente (mismo usuario, no se duplica).

**H4 — Login**
Como usuario registrado, quiero iniciar sesión con mi email y contraseña, para acceder a mi economía.

- Criterio de aceptación 1: credenciales correctas → se inicia sesión y accedo a mi dashboard.
- Criterio de aceptación 2: credenciales incorrectas → mensaje de error genérico ("email o contraseña incorrectos"), sin indicar cuál de los dos falló.
- Criterio de aceptación 3: tras 5 intentos fallidos consecutivos sobre la misma cuenta en 15 minutos, la cuenta queda bloqueada temporalmente 15 minutos, y se informa de ello sin dar pistas de si el email existe.

**H5 — Recuperación de contraseña**
Como usuario que ha olvidado su contraseña, quiero poder restablecerla, para recuperar el acceso a mi cuenta.

- Criterio de aceptación 1: al solicitar recuperación con un email, se envía un enlace de un solo uso válido 1 hora (exista o no esa cuenta, para no filtrar qué emails están registrados).
- Criterio de aceptación 2: al usar el enlace y fijar una nueva contraseña válida, todas las sesiones activas anteriores de esa cuenta se cierran.

**H6 — Sesión y cierre de sesión**
Como usuario, quiero poder cerrar sesión y ver/cerrar mis sesiones activas en otros dispositivos, para controlar el acceso a mi cuenta.

- Criterio de aceptación 1: "Cerrar sesión" invalida el token de la sesión actual.
- Criterio de aceptación 2: en mi perfil veo una lista de sesiones activas (dispositivo/navegador aproximado, fecha de último uso) y puedo cerrar cualquiera de ellas de forma remota.

**H7 — Gestión de perfil**
Como usuario, quiero editar mis datos de perfil y cambiar mi contraseña estando autenticado, para mantener mi cuenta al día.

- Criterio de aceptación 1: puedo cambiar nombre, moneda por defecto e idioma.
- Criterio de aceptación 2: para cambiar la contraseña estando autenticado debo confirmar la contraseña actual.

**H8 — Exportar y eliminar cuenta**
Como usuario, quiero poder exportar todos mis datos y, si quiero, eliminar mi cuenta, para tener control total sobre mi información (RGPD).

- Criterio de aceptación 1: puedo pedir una exportación de todos mis datos (perfil + todo dato económico) en un formato descargable (JSON o CSV).
- Criterio de aceptación 2: eliminar la cuenta requiere confirmación explícita (reintroducir contraseña o email) y es irreversible; se informa de esto antes de confirmar.
- Criterio de aceptación 3: tras eliminar la cuenta, ni el usuario ni ningún administrador puede volver a acceder a esos datos económicos (se elimina o se anonimiza, a decidir en el plan).

## 3. Aislamiento de datos (crítico, ver constitution §2)

- Ningún usuario puede, bajo ninguna circunstancia, leer, listar o modificar datos (perfil o económicos) de otro usuario a través de la API.
- El rol Administrador solo puede gestionar el ciclo de vida de la cuenta (activar/desactivar/soporte), nunca leer directamente los datos económicos de un usuario sin un motivo de soporte auditado.

## 4. Reglas de negocio concretas

- Política de contraseña: mínimo 10 caracteres, al menos una letra y un número. (Ajustable en el plan si se decide usar una librería con recomendaciones distintas, p. ej. zxcvbn por fuerza estimada en vez de reglas fijas — a decidir en `plan.md`.)
- Bloqueo por intentos fallidos: 5 intentos / 15 minutos por cuenta.
- Verificación de email: caduca en 24h. Recuperación de contraseña: caduca en 1h.
- 2FA: **no entra en esta spec** (ver sección 5, fuera de alcance) — se hará como spec 001-b más adelante si se prioriza.

## 5. Fuera de alcance de esta spec

- Autenticación en dos factores (2FA) — RF-U9 es "deseable", se difiere a una spec posterior.
- Modelo de "economía compartida" entre varios usuarios — descartado para todo el proyecto según decisión ya tomada.
- Panel de administración completo — solo lo mínimo para que un admin desactive una cuenta si hace falta; no es objeto de esta spec.

## 6. Preguntas abiertas (a resolver antes o durante el plan)

1. ¿El registro solo con email/contraseña + Google, o también se contempla Apple/Microsoft desde ya? (el documento de requisitos los marcaba como "opcional").
2. Exportación de datos: ¿JSON, CSV, o ambos, en esta primera versión?
3. Eliminación de cuenta: ¿borrado físico inmediato o soft-delete con purga diferida (p. ej. 30 días de gracia por si el usuario se arrepiente)?

---
**Siguiente paso:** revisar esta spec (ajustar historias, criterios o reglas de negocio) y aprobarla. Al aprobarla, se genera `plan.md` con el diseño técnico (modelo de datos, endpoints, decisiones de las preguntas abiertas).
