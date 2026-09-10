import { describe, expect, it } from 'vitest';
import { InvalidStockCsvError, matchStockNames, parseStockCsv } from './stock-import.parsing.js';
import type { ExistingStockRef } from './stock-import.parsing.js';

/** CSVs sintéticos, nunca el fichero real de Diego (plan.md §13). */
function csvLine(cells: string[]): string {
  return cells.map((c) => `"${c}"`).join(',');
}

function buildCsv(options: {
  summary?: string[][];
  open?: string[][];
  closed?: string[][];
  includeSections?: Array<'summary' | 'open' | 'closed'>;
  summaryHeader?: string[];
  openHeader?: string[];
  closedHeader?: string[];
  /** Reproduce el BOM UTF-8 que lleva el CSV real exportado por Investing.com. */
  bom?: boolean;
}): Buffer {
  const includeSections = options.includeSections ?? ['summary', 'open', 'closed'];
  const summaryHeader = options.summaryHeader ?? ['', 'Nombre', 'Símbolo', 'Precio actual'];
  const openHeader = options.openHeader ?? ['', 'Nombre', 'Símbolo', 'Fecha apertura', 'Cantidad', 'Precio entrada'];
  const closedHeader = options.closedHeader ?? [
    '',
    'Nombre',
    'Símbolo',
    'F. apertura',
    'Cantidad',
    'Precio entrada',
    'Fecha cierre',
    'Precio cierre',
  ];

  const blocks: string[] = [];

  if (includeSections.includes('summary')) {
    blocks.push(csvLine(['Resumen de posiciones']));
    blocks.push(csvLine(summaryHeader));
    for (const row of options.summary ?? []) blocks.push(csvLine(['', ...row]));
    blocks.push('""');
    blocks.push(csvLine(['Val. mercado', '100,00 €']));
    blocks.push('');
  }

  if (includeSections.includes('open')) {
    blocks.push(csvLine(['Posiciones abiertas']));
    blocks.push(csvLine(openHeader));
    for (const row of options.open ?? []) blocks.push(csvLine(['', ...row]));
    blocks.push('""');
  }

  if (includeSections.includes('closed')) {
    blocks.push(csvLine(['Posiciones cerradas']));
    blocks.push(csvLine(closedHeader));
    for (const row of options.closed ?? []) blocks.push(csvLine(['', ...row]));
    blocks.push('""');
    blocks.push(csvLine(['B/P posic. cerradas', '10,00 €']));
  }

  const text = (options.bom ? '﻿' : '') + blocks.join('\n');
  return Buffer.from(text, 'utf-8');
}

describe('parseStockCsv', () => {
  it('localiza las 3 secciones aunque tengan un número de filas distinto', () => {
    const csv = buildCsv({
      summary: [['Repsol', 'REP', '29,120']],
      open: [
        ['Repsol', 'REP', '09/04/2025', '260.00000000', '9,607']],
      closed: [
        ['Amadeus', 'AMA', '08/07/2026', '50.00000000', '50,160', '08/09/2026', '55,720'],
        ['Global Dominion', 'DOMI.MC', '30/06/2023', '229.00000000', '3,968', '08/07/2026', '2,947'],
      ],
    });

    const parsed = parseStockCsv(csv);

    expect(parsed.summary).toHaveLength(1);
    expect(parsed.summary[0]).toMatchObject({ nombre: 'Repsol' });
    expect(parsed.openLots).toHaveLength(1);
    expect(parsed.closedLots).toHaveLength(2);
  });

  it('rechaza el fichero si falta la sección "Resumen de posiciones"', () => {
    const csv = buildCsv({ includeSections: ['open', 'closed'] });
    expect(() => parseStockCsv(csv)).toThrow(InvalidStockCsvError);
  });

  it('rechaza el fichero si a la sección "Posiciones abiertas" le falta una columna requerida', () => {
    const csv = buildCsv({
      openHeader: ['', 'Nombre', 'Símbolo', 'Cantidad', 'Precio entrada'], // sin "Fecha apertura"
      open: [['Repsol', 'REP', '260.00000000', '9,607']],
    });
    expect(() => parseStockCsv(csv)).toThrow(/Posiciones abiertas/);
  });

  it('parsea "Cantidad" con punto decimal sin separador de miles, distinto de un precio con el mismo nº de dígitos', () => {
    // Caso real (plan.md §9): IAG con 1000 y 1500 acciones, Telefónica con 1420 — si se
    // confundiera con el formato español, 1420.00000000 se leería como 1,42.
    const csv = buildCsv({
      open: [['IAG', 'ICAG', '21/12/2020', '1000.00000000', '1,555']],
    });
    const parsed = parseStockCsv(csv);
    expect(parsed.openLots[0].cantidad.toString()).toBe('1000');
    expect(parsed.openLots[0].precioEntrada.toString()).toBe('1.555');
  });

  it('parsea un precio de compra "0,000" como cero, sin rechazar la fila', () => {
    // Caso real (plan.md §3/§9): Vidrala/Viscofan, lotes de acciones regalo.
    const csv = buildCsv({
      open: [['Vidrala', 'VID', '02/12/2025', '1.35000000', '0,000']],
    });
    const parsed = parseStockCsv(csv);
    expect(parsed.openLots[0].precioEntrada.toString()).toBe('0');
    expect(parsed.openLots[0].cantidad.toString()).toBe('1.35');
  });

  it('parsea un precio con separador de miles correctamente (1.014,200 = 1014,200)', () => {
    const csv = buildCsv({
      summary: [['Rheinmetall AG', 'RHMG', '1.014,200']],
    });
    const parsed = parseStockCsv(csv);
    expect(parsed.summary[0].precioActual.toString()).toBe('1014.2');
  });

  it('convierte fechas dd/mm/aaaa a ISO en compras y ventas cerradas', () => {
    const csv = buildCsv({
      closed: [['Amadeus', 'AMA', '08/07/2026', '50.00000000', '50,160', '08/09/2026', '55,720']],
    });
    const parsed = parseStockCsv(csv);
    expect(parsed.closedLots[0].fechaApertura).toBe('2026-07-08');
    expect(parsed.closedLots[0].fechaCierre).toBe('2026-09-08');
  });

  it('acepta un fichero con BOM UTF-8 al principio (tal cual lo exporta Investing.com)', () => {
    // Bug real encontrado con el fichero real de Diego: sin manejar el BOM,
    // csv-parse ni siquiera conseguía interpretar la primera celda
    // entrecomillada y el fichero se rechazaba entero como "no válido".
    const csv = buildCsv({
      summary: [['Repsol', 'REP', '29,120']],
      bom: true,
    });

    const parsed = parseStockCsv(csv);

    expect(parsed.summary).toHaveLength(1);
    expect(parsed.summary[0].nombre).toBe('Repsol');
  });
});

describe('matchStockNames', () => {
  it('marca como "new" un nombre sin ninguna coincidencia', () => {
    const result = matchStockNames(['Repsol'], []);
    expect(result).toEqual([{ nombre: 'Repsol', status: 'new' }]);
  });

  it('marca como "existing" y reutiliza id/custodyBank con una única coincidencia normalizada', () => {
    const existing: ExistingStockRef[] = [{ id: 'stock-1', custodyBank: 'MyInvestor', stock: 'Repsol' }];
    const result = matchStockNames(['REPSOL'], existing);
    expect(result).toEqual([{ nombre: 'REPSOL', status: 'existing', existingStock: { id: 'stock-1', custodyBank: 'MyInvestor' } }]);
  });

  it('coincide ignorando tildes, mayúsculas y espacios sobrantes', () => {
    const existing: ExistingStockRef[] = [{ id: 'stock-1', custodyBank: 'MyInvestor', stock: 'Redeia Corporación' }];
    const result = matchStockNames([' redeia corporacion  '], existing);
    expect(result[0]).toMatchObject({ status: 'existing', existingStock: { id: 'stock-1' } });
  });

  it('marca como "ambiguous" y no elige ninguna con dos o más coincidencias', () => {
    const existing: ExistingStockRef[] = [
      { id: 'stock-1', custodyBank: 'MyInvestor', stock: 'Santander' },
      { id: 'stock-2', custodyBank: 'DEGIRO', stock: 'Santander' },
    ];
    const result = matchStockNames(['Santander'], existing);
    expect(result).toEqual([{ nombre: 'Santander', status: 'ambiguous' }]);
  });

  it('deduplica nombres repetidos del CSV, devolviendo una sola entrada por nombre distinto', () => {
    const result = matchStockNames(['Repsol', 'Repsol', 'BBVA'], []);
    expect(result).toHaveLength(2);
  });
});
