import { describe, expect, it } from 'vitest';
import { inferCategoryIcon, resolveCategoryIcon } from './category-icons.js';

describe('category-icons', () => {
  describe('inferCategoryIcon', () => {
    it('reconoce palabras clave sin importar mayúsculas ni acentos', () => {
      expect(inferCategoryIcon('Coche', 'EXPENSE')).toBe('🚗');
      expect(inferCategoryIcon('COCHE', 'EXPENSE')).toBe('🚗');
      expect(inferCategoryIcon('Vehículo', 'EXPENSE')).toBe('🚗');
    });

    it('reconoce la palabra clave en medio del nombre, no solo como nombre exacto', () => {
      expect(inferCategoryIcon('Vivienda/Alquiler', 'EXPENSE')).toBe('🏠');
      expect(inferCategoryIcon('Seguro médico', 'EXPENSE')).toBe('⚕️');
    });

    it('sin ninguna coincidencia, usa el icono genérico del tipo', () => {
      expect(inferCategoryIcon('Varios', 'EXPENSE')).toBe('💳');
      expect(inferCategoryIcon('Otros', 'INCOME')).toBe('💰');
    });

    it('cubre las categorías por defecto reales (CategoriesService)', () => {
      expect(inferCategoryIcon('Nómina', 'INCOME')).toBe('💼');
      expect(inferCategoryIcon('Comida', 'EXPENSE')).toBe('🍔');
      expect(inferCategoryIcon('Transporte', 'EXPENSE')).toBe('🚌');
      expect(inferCategoryIcon('Salud', 'EXPENSE')).toBe('⚕️');
      expect(inferCategoryIcon('Utilities', 'EXPENSE')).toBe('💡');
    });
  });

  describe('resolveCategoryIcon', () => {
    it('con icono guardado, lo devuelve tal cual sin inferir del nombre', () => {
      expect(resolveCategoryIcon({ icon: '🔥', name: 'Comida', type: 'EXPENSE' })).toBe('🔥');
    });

    it('sin icono guardado (null), infiere uno del nombre actual', () => {
      expect(resolveCategoryIcon({ icon: null, name: 'Coche', type: 'EXPENSE' })).toBe('🚗');
    });
  });
});
