import { describe, expect, it } from 'vitest';
import { escapeLike, findSnippet, normalizeSearch, searchTerms } from './receipt-search.js';

describe('normalizeSearch (spec 051 plan.md §2)', () => {
  it('quita tildes y diéresis y pasa a minúsculas, como immutable_unaccent(lower())', () => {
    expect(normalizeSearch('LAVADORA Pequeñín Ácido Pingüino')).toBe('lavadora pequenin acido pinguino');
  });

  it('deja igual lo que no tiene tildes', () => {
    expect(normalizeSearch('abc 123 %_')).toBe('abc 123 %_');
  });
});

describe('searchTerms', () => {
  it('separa por espacios, normaliza y quita duplicados', () => {
    expect(searchTerms('  Lavadora  BOSCH lavadora ')).toEqual(['lavadora', 'bosch']);
  });

  it('ignora los términos de un solo carácter y una búsqueda vacía', () => {
    expect(searchTerms('a de x')).toEqual(['de']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('como mucho 8 términos', () => {
    expect(searchTerms('aa bb cc dd ee ff gg hh ii jj')).toHaveLength(8);
  });
});

describe('escapeLike', () => {
  it('escapa los comodines de LIKE y la barra', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });
});

describe('findSnippet', () => {
  const text = 'MEDIA MARKT\nFactura simplificada\nLAVADORA BOSCH Serie 6 WAU28PH1ES   549,00\nGarantía 3 años\nTotal 549,00';

  it('devuelve el fragmento alrededor de la coincidencia, con "…" a los lados y los saltos de línea como espacios', () => {
    expect(findSnippet(text, ['bosch'], 15)).toBe('…icada LAVADORA BOSCH Serie 6 WAU28P…');
  });

  it('encuentra palabras a medias y sin tildes, y conserva las tildes del texto original', () => {
    expect(findSnippet(text, ['garantia'], 10)).toBe('…ES 549,00 Garantía 3 años To…');
  });

  it('sin "…" cuando la coincidencia está al principio o al final', () => {
    expect(findSnippet('Lavadora Bosch', ['lavad'], 40)).toBe('Lavadora Bosch');
    expect(findSnippet(text, ['total'], 7)).toBe('…3 años Total 549,00');
  });

  it('usa el primer término que aparezca, en el orden del texto', () => {
    expect(findSnippet('uno dos tres', ['tres', 'dos'], 2)).toBe('…o dos t…');
  });

  it('null si no aparece ningún término o el texto está vacío', () => {
    expect(findSnippet(text, ['secadora'])).toBeNull();
    expect(findSnippet('', ['a'])).toBeNull();
    expect(findSnippet(null, ['a'])).toBeNull();
  });

  it('mantiene alineadas las posiciones con varias letras con tilde antes de la coincidencia', () => {
    expect(findSnippet('Ñandú, pingüino y camión: CAFÉ', ['cafe'], 3)).toBe('…n: CAFÉ');
  });
});
