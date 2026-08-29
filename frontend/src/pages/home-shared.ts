// Spec 008 (rediseño Broadsheet), plan.md §3. Ningún otro sitio de la app
// formatea moneda hoy (DashboardPage/GoalsPage muestran los importes tal
// cual llegan del backend, p. ej. "648.20"); este helper solo lo usa
// HomePage, para igualar el mockup ("648,20 €"). Fijo a es-ES/EUR — no lee
// `currency`/`locale` del perfil del usuario (spec 001): toda la interfaz ya
// es fija en español, y `useAuth().user` no expone esos campos (son de
// `UserProfile`, un fetch aparte que HomePage no hace hoy).
const CURRENCY_FORMATTER = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function formatCurrency(amount: string): string {
  return CURRENCY_FORMATTER.format(parseFloat(amount));
}
