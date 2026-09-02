import type { Category } from './categories.service.js';

/**
 * "Crea automáticamente" el icono de una categoría a partir de su nombre:
 * reglas por palabra clave (sin acentos, para no duplicar cada variante),
 * primera coincidencia gana. Sin coincidencia, cae al icono por defecto de
 * su tipo (`DEFAULT_INCOME_ICON`/`DEFAULT_EXPENSE_ICON`) — ninguna
 * categoría se queda nunca sin icono.
 */
const ICON_RULES: Array<{ keywords: string[]; icon: string }> = [
  { keywords: ['nomina', 'salario', 'sueldo'], icon: '💼' },
  { keywords: ['dividendo'], icon: '📈' },
  { keywords: ['interes'], icon: '🏦' },
  { keywords: ['accion', 'bolsa', 'inversion'], icon: '📊' },
  { keywords: ['cashback', 'devolucion'], icon: '💵' },
  { keywords: ['descuento'], icon: '🏷️' },
  { keywords: ['loteria', 'premio', 'sorteo'], icon: '🎰' },
  { keywords: ['regalo'], icon: '🎁' },
  { keywords: ['dieta'], icon: '🍽️' },
  { keywords: ['ahorro'], icon: '🐷' },
  { keywords: ['impuesto', 'hacienda', 'irpf'], icon: '🧾' },
  { keywords: ['comida', 'super', 'alimentacion', 'restaurante', 'compra'], icon: '🍔' },
  { keywords: ['transporte', 'gasolina', 'combustible', 'bus', 'metro', 'taxi', 'uber', 'peaje'], icon: '🚌' },
  { keywords: ['salud', 'medic', 'farmacia', 'hospital', 'dentista'], icon: '⚕️' },
  { keywords: ['vivienda', 'alquiler', 'hipoteca', 'casa', 'hogar'], icon: '🏠' },
  { keywords: ['coche', 'auto', 'vehiculo', 'moto', 'parking', 'garaje'], icon: '🚗' },
  { keywords: ['ropa', 'moda', 'zapato', 'calzado'], icon: '👕' },
  { keywords: ['suscripcion', 'netflix', 'spotify', 'streaming'], icon: '📱' },
  { keywords: ['utilit', 'luz', 'agua', 'gas', 'electricidad', 'internet', 'telefono'], icon: '💡' },
  { keywords: ['ocio', 'capricho', 'cine', 'viaje', 'hobby', 'entretenimiento'], icon: '🎉' },
  { keywords: ['apuesta', 'casino', 'juego'], icon: '🎲' },
  { keywords: ['asociacion', 'cuota', 'club', 'gimnasio', 'colegio profesional'], icon: '🤝' },
  { keywords: ['mascota', 'perro', 'gato', 'veterinario'], icon: '🐾' },
  { keywords: ['educacion', 'curso', 'universidad', 'formacion'], icon: '🎓' },
];

const DEFAULT_INCOME_ICON = '💰';
const DEFAULT_EXPENSE_ICON = '💳';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function inferCategoryIcon(name: string, type: Category['type']): string {
  const normalized = normalize(name);
  for (const rule of ICON_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.icon;
    }
  }
  return type === 'INCOME' ? DEFAULT_INCOME_ICON : DEFAULT_EXPENSE_ICON;
}

/** Icono a mostrar: el guardado explícitamente, o el inferido del nombre
 * actual si nunca se ha fijado uno (categorías anteriores a esta
 * funcionalidad, o creadas sin especificarlo). */
export function resolveCategoryIcon(category: Pick<Category, 'icon' | 'name' | 'type'>): string {
  return category.icon ?? inferCategoryIcon(category.name, category.type);
}

/** Paleta curada para el selector del frontend — un subconjunto de los
 * iconos que puede producir `inferCategoryIcon`, con una etiqueta legible
 * para cada uno. Vive en el backend porque es la fuente de verdad de qué
 * iconos "tienen sentido" en la app; el frontend la replica en
 * `frontend/src/pages/category-icons.ts` (paquetes separados, sin build
 * compartido entre ambos). */
export const CATEGORY_ICON_PALETTE: Array<{ icon: string; label: string }> = [
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
