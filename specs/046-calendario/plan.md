# Plan — Spec 046

**Fase:** 2 de 4. Solo frontend; reutiliza `GET /transactions` (filtros `dateFrom`/`dateTo`, `limit` máx. 200, se pagina hasta `totalItems`) y la caché local (`filterCachedTransactions`).

- `pages/calendar-shared.ts` — funciones puras: `buildMonthGrid(month)` (semanas lun–dom, sin `Date` local: solo `Date.UTC` para el calendario), `shiftMonth`, `monthLabel`, `groupByDate`, `monthTotals` (con `Decimal`).
- `pages/CalendarPage.tsx` — carga del mes (online/offline), cuadrícula, resumen, detalle. Categorías de ambos tipos con `useCategoriesForType` para los iconos.
- Ruta `/calendar` en `App.tsx`; entrada "Calendario" 📅 en `NAV_ITEMS` de `AppLayout`.
- Estilos `.cal-*` en `index.css` con los tokens oscuros de la spec 045.
