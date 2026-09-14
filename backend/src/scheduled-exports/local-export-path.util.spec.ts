import { describe, expect, it } from 'vitest';
import { sanitizeSubfolder } from './local-export-path.util.js';

describe('sanitizeSubfolder', () => {
  it('null/undefined/cadena vacía devuelven cadena vacía', () => {
    expect(sanitizeSubfolder(null)).toBe('');
    expect(sanitizeSubfolder(undefined)).toBe('');
    expect(sanitizeSubfolder('')).toBe('');
  });

  it('deja pasar letras, dígitos, espacios, guiones y guiones bajos', () => {
    expect(sanitizeSubfolder('Backups 2026-09_finales')).toBe('Backups 2026-09_finales');
  });

  it('quita cualquier "..", incluso repetido o combinado', () => {
    expect(sanitizeSubfolder('../../etc')).toBe('etc');
    expect(sanitizeSubfolder('a/../b')).toBe('a/b');
  });

  it('quita caracteres fuera del conjunto permitido (símbolos, null bytes, etc.)', () => {
    expect(sanitizeSubfolder('a;rm -rf~$(whoami)')).toBe('arm -rfwhoami');
  });

  it('colapsa barras repetidas y quita las iniciales/finales', () => {
    expect(sanitizeSubfolder('//a///b//')).toBe('a/b');
  });

  it('una subcarpeta ya limpia no cambia', () => {
    expect(sanitizeSubfolder('mis backups/2026')).toBe('mis backups/2026');
  });
});
