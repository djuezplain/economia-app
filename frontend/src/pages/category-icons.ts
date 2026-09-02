// Espejo de `backend/src/categories/category-icons.ts` (`CATEGORY_ICON_PALETTE`)
// — paquetes separados, sin build compartido entre frontend y backend, así
// que se duplica la paleta a mano. El backend sigue siendo quien decide el
// icono real (infiere el suyo si no se manda ninguno); esta lista es solo
// para el selector.
export const CATEGORY_ICON_OPTIONS: Array<{ icon: string; label: string }> = [
  { icon: '💼', label: 'Trabajo / nómina' },
  { icon: '📈', label: 'Inversión' },
  { icon: '🏦', label: 'Banco / intereses' },
  { icon: '📊', label: 'Bolsa' },
  { icon: '💵', label: 'Efectivo' },
  { icon: '🏷️', label: 'Descuento' },
  { icon: '🎰', label: 'Lotería' },
  { icon: '🎁', label: 'Regalo' },
  { icon: '🍽️', label: 'Dietas' },
  { icon: '🐷', label: 'Ahorro' },
  { icon: '🧾', label: 'Impuestos' },
  { icon: '🍔', label: 'Comida' },
  { icon: '🚌', label: 'Transporte' },
  { icon: '⚕️', label: 'Salud' },
  { icon: '🏠', label: 'Vivienda' },
  { icon: '🚗', label: 'Coche' },
  { icon: '👕', label: 'Ropa' },
  { icon: '📱', label: 'Suscripciones' },
  { icon: '💡', label: 'Suministros' },
  { icon: '🎉', label: 'Ocio' },
  { icon: '🎲', label: 'Apuestas' },
  { icon: '🤝', label: 'Asociaciones' },
  { icon: '🐾', label: 'Mascotas' },
  { icon: '🎓', label: 'Educación' },
  { icon: '💰', label: 'Ingreso (genérico)' },
  { icon: '💳', label: 'Gasto (genérico)' },
];
