# Documento de Requisitos — Aplicación Web de Gestión de Economía Personal

**Autor:** Diego Juez
**Fecha:** 12 de agosto de 2026
**Versión:** 1.0
**Fuente de análisis:** Hoja de cálculo de Google Drive "2026"

---

## 1. Introducción

Diego lleva su economía personal en una hoja de cálculo de Google Sheets ("2026") con un nivel de detalle considerable: registro diario de ingresos y gastos, resumen mensual con porcentaje de ahorro, objetivos de gasto/ahorro, proyección de patrimonio a largo plazo, seguimiento de compraventa de acciones con cálculo de plusvalías e impuestos, seguimiento de fondos de inversión/pensiones, y un rastreador de cashback por comercio.

El objetivo de este documento es traducir esa hoja de cálculo en los requisitos de una aplicación web que sustituya y mejore ese Excel, añadiendo autenticación y gestión de usuarios, de forma que varias personas puedan usar la aplicación, cada una con su propia economía privada y aislada.

Este documento no es una especificación técnica cerrada de implementación, sino la base funcional y no funcional sobre la que diseñar y construir la aplicación.

## 2. Objetivos del producto

- Sustituir el Excel "2026" por una aplicación web accesible desde cualquier dispositivo.
- Mantener (y mejorar la usabilidad de) todas las funcionalidades ya presentes en el Excel: ingresos, gastos, resumen mensual, objetivos, patrimonio, inversiones y cashback.
- Permitir que varios usuarios se registren y usen la aplicación, cada uno viendo y gestionando exclusivamente sus propios datos.
- Reducir el mantenimiento manual de fórmulas: los cálculos (totales, medias, % de ahorro, plusvalías, impuestos) deben ser automáticos.
- Sentar una base sobre la que en el futuro se puedan añadir funcionalidades adicionales (importación bancaria, alertas, informes, app móvil, etc.).

## 3. Alcance

### 3.1 Incluido en esta versión

- Registro/login de usuarios y gestión básica de cuenta.
- Registro de ingresos y gastos categorizados.
- Dashboard con resumen mensual y anual.
- Objetivos y presupuestos de gasto/ahorro.
- Seguimiento de patrimonio y proyección a futuro.
- Seguimiento de inversiones: acciones (compraventa, plusvalías, impuestos) y fondos/planes de inversión.
- Rastreador de cashback y descuentos por comercio.
- Comparativa interanual de ingresos, gastos y ahorro.
- Importación de los datos históricos desde el Excel "2026".

### 3.2 Fuera de alcance (ver sección 9)

- Conexión automática con bancos (open banking / PSD2).
- Aplicación móvil nativa (se contempla un diseño web responsive, no apps de iOS/Android).
- Asesoramiento financiero automatizado o recomendaciones de inversión.

## 4. Usuarios y roles

La aplicación es **multiusuario con datos aislados**: cualquier persona puede registrarse y gestionar su propia economía, pero nunca ve ni puede acceder a los datos de otro usuario (a diferencia de un modelo de "economía familiar compartida").

Roles previstos:

| Rol | Descripción |
|---|---|
| Usuario estándar | Persona registrada que gestiona sus propios ingresos, gastos, inversiones y objetivos. Es el rol por defecto. |
| Administrador | Rol interno (Diego / equipo de soporte) con acceso a gestión de cuentas (activar/desactivar usuarios, soporte, métricas de uso agregadas), sin acceso a los datos económicos concretos de cada usuario salvo necesidad justificada de soporte. |

No se contempla, en esta versión, compartir una misma economía entre varios usuarios (p. ej. pareja compartiendo un presupuesto común); si en el futuro se desea, se podría añadir como una funcionalidad de "espacios compartidos" opcional sin romper el modelo aislado por defecto.

## 5. Requisitos de autenticación y gestión de usuarios

### 5.1 Registro
- RF-U1: Un visitante puede crear una cuenta con nombre, email y contraseña.
- RF-U2: El email debe verificarse mediante un enlace/código enviado por correo antes de poder operar con datos económicos.
- RF-U3: La contraseña debe cumplir una política mínima de seguridad (longitud mínima, combinación de caracteres) validada tanto en cliente como en servidor.
- RF-U4: Alternativamente, debe poder registrarse mediante proveedores externos (Google, y opcionalmente Apple/Microsoft) mediante OAuth 2.0, dado que el usuario ya usa Google Drive.

### 5.2 Inicio de sesión
- RF-U5: Login con email/contraseña o con proveedor externo (Google).
- RF-U6: Recuperación de contraseña mediante enlace temporal enviado por email.
- RF-U7: Bloqueo temporal de la cuenta tras varios intentos fallidos consecutivos (protección frente a fuerza bruta).
- RF-U8: Cierre de sesión y gestión de sesiones activas (ver dispositivos conectados y poder cerrar sesión remota).
- RF-U9 (deseable): Autenticación en dos factores (2FA) opcional, vía app de autenticación o SMS/email, dado que la app maneja datos financieros sensibles.

### 5.3 Gestión de cuenta y perfil
- RF-U10: El usuario puede editar sus datos de perfil (nombre, email, moneda por defecto, idioma).
- RF-U11: El usuario puede cambiar su contraseña estando autenticado.
- RF-U12: El usuario puede eliminar su cuenta, con confirmación explícita y borrado (o anonimización) de sus datos según la normativa aplicable.
- RF-U13: El usuario puede exportar todos sus datos (ver RF-8.x) antes de eliminar la cuenta.

### 5.4 Aislamiento de datos
- RF-U14: Todo dato económico (ingreso, gasto, activo, objetivo, etc.) pertenece exclusivamente a un usuario; ningún endpoint ni vista debe poder exponer datos de un usuario a otro salvo al rol Administrador en tareas de soporte y bajo auditoría.
- RF-U15: Todas las peticiones al backend deben validar que el recurso solicitado pertenece al usuario autenticado (autorización a nivel de fila, no solo autenticación).

## 6. Requisitos funcionales — módulos económicos

Cada módulo se corresponde con una parte identificada en el Excel "2026".

### 6.1 Ingresos
Basado en la hoja "Ingresos" (columnas Fecha, Tipo, Concepto, Valor, Mes).

- RF-1.1: Registrar un ingreso con fecha, tipo/categoría, concepto, importe y (calculado automáticamente) mes/año.
- RF-1.2: Categorías de ingreso iniciales, editables por el usuario: Nómina, Dividendo, Intereses, Acciones (venta), Cashback, Descuentos, Lotería, Regalo, Dietas, Otros.
- RF-1.3: Editar y eliminar ingresos ya registrados.
- RF-1.4: Listar ingresos con filtros por rango de fechas, categoría y texto libre (concepto).
- RF-1.5: Calcular automáticamente el total de ingresos y la media mensual, por categoría y global, sin fórmulas manuales.
- RF-1.6: Soporte de ingresos recurrentes (p. ej. nómina mensual) con creación automática o plantilla reutilizable.

### 6.2 Gastos
Basado en la hoja "Gastos" (columnas Fecha, Tipo, Subtipo, Concepto, Tienda/Empresa, Valor, Mes).

- RF-2.1: Registrar un gasto con fecha, tipo de pago, categoría, subcategoría, concepto, comercio/empresa e importe.
- RF-2.2: Tipos de pago iniciales: Tarjeta, Recibo (domiciliación), Efectivo, Transferencia.
- RF-2.3: Categorías/subcategorías iniciales (editables): Comida, Transporte, Salud, Vivienda/Alquiler, Coche, Ropa, Suscripciones, Utilities (suministros), Ocio/Caprichos, Apuestas, Asociaciones, Varios — reflejando las subcategorías ya usadas en el Excel (Comida, Transporte, Utilities, Caprichos, Ropa, Varios, Coche, Salud, Asociaciones, Apuestas, Alquiler, Suscripciones, y categorías personalizadas del usuario).
- RF-2.4: Editar y eliminar gastos ya registrados.
- RF-2.5: Listar y filtrar gastos por fecha, categoría, subcategoría y comercio.
- RF-2.6: Calcular automáticamente totales y medias por mes, categoría y subcategoría.
- RF-2.7: Gestión de gastos recurrentes (alquiler, suscripciones) con recordatorio o generación automática mensual.
- RF-2.8: Permitir crear categorías y subcategorías personalizadas más allá de las iniciales.

### 6.3 Dashboard y resumen mensual/anual
Basado en la tabla resumen "Mes | Ingresos | Gastos | Ahorro Mensual | % Ahorro | Gastos por Día...".

- RF-3.1: Panel principal con resumen del mes en curso: ingresos, gastos, ahorro (neto) y porcentaje de ahorro.
- RF-3.2: Gráficos de evolución mensual de ingresos, gastos y ahorro a lo largo del año.
- RF-3.3: Desglose de gastos por categoría (p. ej. gráfico circular) por mes o periodo seleccionado.
- RF-3.4: Indicadores calculados automáticamente: gasto medio por día, ingreso medio por día, ahorro medio por día, ahorro acumulado en el año.
- RF-3.5: Vista anual con acumulados de ingresos, gastos y ahorro totales, y % de ahorro global.

### 6.4 Objetivos y presupuestos
Basado en la sección "Objetivo Gasto (30%)", "Objetivo ahorro", "Objetivo Medio diario", etc.

- RF-4.1: El usuario puede definir un objetivo de ahorro (importe o % de los ingresos) mensual y/o anual.
- RF-4.2: El usuario puede definir un presupuesto de gasto por categoría y/o global (p. ej. "no más del 30% de los ingresos en X").
- RF-4.3: La aplicación debe mostrar el progreso real frente al objetivo/presupuesto definido (importe y %), incluyendo la desviación (diferencia) y proyección de si se cumplirá a fin de mes/año.
- RF-4.4: Alertas visuales (y opcionalmente notificación) cuando el gasto en una categoría se acerque o supere el presupuesto definido.

### 6.5 Patrimonio y proyección
Basado en la sección "Inicio 2024", "Gastos 2024", "Ingresos 2024", "Final 2024 reval 3%/4%/5%".

- RF-5.1: El usuario puede registrar su patrimonio de partida (fecha y valor).
- RF-5.2: La aplicación calcula la evolución del patrimonio a partir del ahorro acumulado (ingresos − gastos) y, opcionalmente, de la revalorización de inversiones.
- RF-5.3: Simulador de proyección de patrimonio a futuro con distintos escenarios de revalorización anual (por ejemplo 3%, 4%, 5%, configurables por el usuario), a partir del ahorro histórico y/o un ahorro mensual estimado.
- RF-5.4: Comparativa de la estimación frente al valor real alcanzado (estimado vs. real), como ya se hace en el Excel para "Gastos" e "Ingresos" mensuales.

### 6.6 Inversiones — Acciones
Basado en la sección de compraventa de acciones (Venta, Ganancias, Pérdidas, Neto, Impuestos, Total Bruto, Total con/sin pérdidas).

- RF-6.1: Registrar compras de acciones/activos: fecha, valor/ticker, cantidad, precio de compra.
- RF-6.2: Registrar ventas de acciones: fecha, cantidad vendida, precio de venta, y cálculo automático de ganancia o pérdida (plusvalía/minusvalía) respecto al precio de compra (FIFO por defecto).
- RF-6.3: Cálculo automático de impuestos estimados sobre la plusvalía (tipos configurables por tramo, ver Anexo del Excel: "Impuestos venta", "Por acción", "Precio recompra"), y del neto tras impuestos.
- RF-6.4: Compensación de pérdidas y ganancias (Total con pérdidas / sin pérdidas) para estimar el impacto fiscal agregado en el ejercicio.
- RF-6.5: Vista consolidada de la cartera: posiciones abiertas, ganancia/pérdida latente, y operaciones cerradas del año con su resultado fiscal.

### 6.7 Inversiones — Fondos y planes
Basado en la sección de seguimiento diario/mensual de fondos (p. ej. "Groupama", "Ostrum") con aportaciones y dividendos.

- RF-7.1: Registrar uno o varios fondos/planes de inversión o pensiones, cada uno con su saldo.
- RF-7.2: Registrar aportaciones periódicas y actualizaciones de valor (saldo) a lo largo del tiempo.
- RF-7.3: Registrar dividendos o rendimientos recibidos de cada fondo, enlazables opcionalmente con el módulo de Ingresos.
- RF-7.4: Gráfico de evolución del saldo de cada fondo y del total invertido a lo largo del tiempo.

### 6.8 Cashback y descuentos
Basado en la tabla de comercios con % de cashback (Temu, PCcomponentes, Repsol, etc.) y el registro de cashback obtenido.

- RF-8.1: Mantener un catálogo de comercios con su porcentaje de cashback/descuento habitual (editable por el usuario).
- RF-8.2: Registrar cashback obtenido en una compra: fecha, comercio, importe base, importe de cashback, % aplicado.
- RF-8.3: El cashback registrado debe poder reflejarse automáticamente como ingreso (categoría "Cashback") sin duplicar la entrada manual.
- RF-8.4: Totales de cashback acumulado por comercio y por periodo.

### 6.9 Comparativa interanual
Basado en la tabla final que compara 2025 vs. 2026 mes a mes.

- RF-9.1: Comparar, mes a mes, ingresos, gastos, ahorro y % de ahorro entre dos (o más) años seleccionables.
- RF-9.2: Vista gráfica de la comparativa interanual.

### 6.10 Importación desde el Excel actual
- RF-10.1: Debe existir una utilidad de importación (asistida o automática) que traspase los datos históricos del Excel "2026" (ingresos, gastos, fondos, operaciones de bolsa, cashback) a la nueva aplicación, evitando la pérdida del histórico ya registrado.
- RF-10.2: La importación debe validar y avisar de filas con datos incompletos o inconsistentes antes de confirmarla.

### 6.11 Exportación de datos
- RF-11.1: El usuario puede exportar sus datos (ingresos, gastos, inversiones) a CSV/Excel en cualquier momento.
- RF-11.2 (deseable): Generación de un informe mensual/anual en PDF.

## 7. Requisitos no funcionales

- RNF-1 **Seguridad**: contraseñas con hash seguro (bcrypt/argon2), comunicación exclusivamente por HTTPS, tokens de sesión con expiración, protección contra CSRF/XSS/SQL injection, cifrado de datos sensibles en reposo.
- RNF-2 **Privacidad y normativa**: cumplimiento de RGPD (al tratarse de datos financieros de un usuario en la UE): consentimiento explícito, derecho de acceso/rectificación/supresión, política de privacidad clara, minimización de datos.
- RNF-3 **Disponibilidad**: objetivo de disponibilidad razonable para uso personal/varios usuarios (p. ej. 99% mensual), con copias de seguridad periódicas de la base de datos.
- RNF-4 **Rendimiento**: tiempos de carga del dashboard por debajo de 2 segundos con hasta varios miles de movimientos por usuario.
- RNF-5 **Usabilidad**: interfaz responsive (escritorio, tablet y móvil vía navegador), en español (con posibilidad de internacionalización futura).
- RNF-6 **Accesibilidad**: cumplimiento razonable de pautas WCAG 2.1 nivel AA en los flujos principales.
- RNF-7 **Escalabilidad**: la arquitectura debe soportar el crecimiento del número de usuarios sin rediseño mayor (aislamiento de datos por usuario ya contemplado en el modelo).
- RNF-8 **Mantenibilidad**: código versionado, con pruebas automatizadas mínimas en los cálculos financieros (totales, plusvalías, impuestos) dado que son datos sensibles a errores.
- RNF-9 **Auditoría**: registro (log) de acciones sensibles (login, cambios de contraseña, eliminación de cuenta, accesos de administrador) con fines de seguridad.
- RNF-10 **Copia de seguridad y recuperación**: backups automáticos diarios con posibilidad de restauración.

## 8. Propuesta técnica (orientativa)

Esta sección es una propuesta de partida, no una decisión cerrada; puede ajustarse según preferencias del equipo de desarrollo.

### 8.1 Arquitectura general

```
[Navegador — SPA responsive]
        │  HTTPS / JSON (REST o GraphQL)
        ▼
[Backend API] ── autenticación (JWT / sesión) ── [Base de datos relacional]
        │
        ├── Servicio de importación (lectura de Excel/Google Sheets)
        ├── Servicio de cálculo financiero (totales, IRPF, proyecciones)
        └── Servicio de notificaciones/email (verificación, alertas, recuperación de contraseña)
```

### 8.2 Stack sugerido

| Capa | Propuesta | Motivo |
|---|---|---|
| Frontend | React o Vue + TypeScript, con librería de gráficos (p. ej. Recharts/Chart.js) | Ecosistema maduro, buen soporte para dashboards y gráficos financieros |
| Backend | Node.js (NestJS/Express) o Python (FastAPI/Django) | APIs REST claras, buen soporte de librerías de autenticación y validación |
| Base de datos | PostgreSQL | Relacional, adecuada para datos financieros con integridad referencial y agregaciones; soporta bien multiusuario con *row-level security* |
| Autenticación | JWT + OAuth2 (Google) vía librería estándar (p. ej. Auth.js, Passport, Auth0/Clerk como alternativa gestionada) | Reduce riesgo de implementar auth desde cero |
| Hosting | Proveedor cloud (Vercel/Netlify para frontend + Render/Railway/Fly.io o similar para backend y BD, o un único proveedor tipo Supabase) | Despliegue sencillo para una app de este tamaño, con opción de escalar |
| Importación Excel | Librería de lectura de hojas de cálculo (p. ej. SheetJS) o integración directa con la API de Google Sheets | Ya usa Google Drive/Sheets, facilita la migración inicial |

### 8.3 Modelo de datos (entidades principales)

- **User**: id, nombre, email, hash_contraseña, proveedor_oauth, fecha_alta, rol, moneda_preferida, estado (activo/eliminado).
- **Category** (Ingreso/Gasto): id, user_id, tipo (ingreso/gasto), nombre, subcategoría_padre_id (nullable), es_predefinida.
- **Transaction**: id, user_id, tipo (ingreso/gasto), fecha, categoria_id, subcategoria_id (nullable), concepto, comercio (nullable), importe, medio_pago (nullable), recurrente (bool), id_recurrencia (nullable).
- **Budget/Goal**: id, user_id, tipo (gasto/ahorro), categoria_id (nullable = global), periodo (mensual/anual), importe_o_porcentaje, fecha_inicio.
- **Asset** (activo financiero — acción o fondo): id, user_id, tipo (accion/fondo), nombre/ticker.
- **AssetTransaction**: id, asset_id, tipo (compra/venta/aportación/dividendo), fecha, cantidad (nullable para fondos), precio_unitario (nullable), importe, ganancia_perdida_calculada (nullable), impuesto_estimado (nullable).
- **Merchant**: id, user_id, nombre, porcentaje_cashback_habitual (nullable).
- **CashbackEntry**: id, user_id, merchant_id, fecha, importe_base, importe_cashback, porcentaje.
- **NetWorthSnapshot**: id, user_id, fecha, valor_patrimonio, origen (manual/calculado).
- **AuditLog**: id, user_id, acción, fecha, ip/dispositivo.

### 8.4 Cálculos automáticos clave a implementar

- Totales y medias mensuales/anuales de ingresos y gastos, por categoría y globales.
- % de ahorro = (ingresos − gastos) / ingresos, por mes y acumulado.
- Ganancia/pérdida en venta de acciones (método FIFO) e impuesto estimado sobre la plusvalía neta del ejercicio (aplicando compensación de pérdidas).
- Proyección de patrimonio con distintos porcentajes de revalorización anual configurables.
- Comparativas interanuales (delta absoluto y %) mes a mes.

## 9. Fuera de alcance

- Integración automática con bancos (agregación bancaria / open banking).
- App móvil nativa (se prioriza web responsive).
- Recomendaciones de inversión automatizadas o asesoramiento financiero regulado.
- Soporte multidivisa avanzado (tipos de cambio en tiempo real) — se contempla una única moneda por usuario en esta primera versión.
- Economías compartidas entre varios usuarios (ver sección 4); posible fase futura.

## 10. Fases sugeridas de implementación

1. **Fase 1 — MVP**: autenticación (registro/login/recuperación), módulos de Ingresos y Gastos, dashboard mensual básico, importación inicial del Excel.
2. **Fase 2**: objetivos/presupuestos, comparativa interanual, exportación de datos.
3. **Fase 3**: módulo de inversiones (acciones y fondos) con cálculo de impuestos, proyección de patrimonio.
4. **Fase 4**: cashback, recurrencias, notificaciones/alertas, 2FA, informes en PDF.

## 11. Anexo — Mapeo de la hoja Excel "2026" a la aplicación

| Sección del Excel | Módulo de la app |
|---|---|
| Hoja "Ingresos" (Fecha, Tipo, Concepto, Valor, Mes) | Módulo Ingresos (6.1) |
| Hoja "Gastos" (Fecha, Tipo, Subtipo, Concepto, Tienda/Empresa, Valor, Mes) | Módulo Gastos (6.2) |
| Tabla resumen "Mes / Ingresos / Gastos / Ahorro Mensual / % Ahorro" | Dashboard (6.3) |
| "Objetivo Gasto (30%)", "Objetivo ahorro", "Objetivo Medio diario" | Objetivos y presupuestos (6.4) |
| "Inicio 2024", "Final 2024 reval 3/4/5%" | Patrimonio y proyección (6.5) |
| Tabla de venta de acciones (Santander, HBX, Telefónica, Viscofan, United Health, Global Dominion...) con ganancias/pérdidas/impuestos | Inversiones — Acciones (6.6) |
| Tabla diaria de fondos (Groupama, Ostrum) y dividendos | Inversiones — Fondos (6.7) |
| Tabla de % cashback por comercio (Temu, PCcomponentes, Repsol...) | Cashback y descuentos (6.8) |
| Tabla comparativa 2025 vs 2026 | Comparativa interanual (6.9) |

---

*Documento generado a partir del análisis de la hoja de cálculo de Google Drive "2026" del usuario, como base de requisitos para el desarrollo de la aplicación web de gestión de economía personal con login y gestión de usuarios.*
