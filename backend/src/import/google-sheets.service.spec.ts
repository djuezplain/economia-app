import { ConfigService } from '@nestjs/config';
import { GaxiosError } from 'gaxios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidWorkbookError } from './import.parsing.js';
import { GoogleSheetAccessError, GoogleSheetsService } from './google-sheets.service.js';

const requestMock = vi.fn();

vi.mock('google-auth-library', async () => {
  const actual = await vi.importActual<typeof import('google-auth-library')>('google-auth-library');
  return {
    ...actual,
    JWT: vi.fn().mockImplementation(function MockJWT() {
      return { request: requestMock };
    }),
  };
});

function buildService(): GoogleSheetsService {
  const values: Record<string, string> = {
    GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: 'import@economia-app.iam.gserviceaccount.com',
    GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY: 'fake-key',
  };
  return new GoogleSheetsService({ get: (key: string) => values[key] } as unknown as ConfigService);
}

/** Coloca los valores en las posiciones (1-based) que espera `INCOME_COLS`/`EXPENSE_COLS`. */
function rowAt(values: Record<number, string | number>): (string | number)[] {
  const row: (string | number)[] = [];
  for (const [col, value] of Object.entries(values)) row[Number(col) - 1] = value;
  return row;
}

/** Serie de fechas de Sheets/Excel: días desde el 30/12/1899 (UTC). */
function serialDate(isoDate: string): number {
  const epoch = Date.UTC(1899, 11, 30);
  const [year, month, day] = isoDate.split('-').map(Number);
  return (Date.UTC(year, month - 1, day) - epoch) / (24 * 60 * 60 * 1000);
}

describe('GoogleSheetsService', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  describe('extractSpreadsheetId', () => {
    const service = buildService();

    it('extrae el ID de una URL completa de edición', () => {
      expect(service.extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1AbC-2345_xyz/edit#gid=0')).toBe('1AbC-2345_xyz');
    });

    it('extrae el ID de una URL sin /edit', () => {
      expect(service.extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1AbC-2345_xyz')).toBe('1AbC-2345_xyz');
    });

    it('acepta un ID ya pelado', () => {
      expect(service.extractSpreadsheetId('1AbC-2345_xyz0000000')).toBe('1AbC-2345_xyz0000000');
    });

    it('devuelve null para texto vacío', () => {
      expect(service.extractSpreadsheetId('   ')).toBeNull();
    });

    it('devuelve null para un formato irreconocible', () => {
      expect(service.extractSpreadsheetId('esto no es una hoja')).toBeNull();
    });
  });

  describe('fetchWorkbook', () => {
    const service = buildService();

    it('produce un ParsedWorkbook con la misma forma que el Excel, saltando filas en blanco', async () => {
      requestMock.mockImplementation(async ({ url }: { url: string }) => {
        if (url.includes('fields=sheets.properties.title')) {
          return { data: { sheets: [{ properties: { title: 'Ingresos' } }, { properties: { title: 'Gastos' } }] } };
        }
        expect(url).toContain('valueRenderOption=UNFORMATTED_VALUE');
        return {
          data: {
            valueRanges: [
              { values: [rowAt({ 7: serialDate('2026-01-01'), 8: 'Nómina', 9: 'Salario enero', 10: 1500 }), []] },
              {
                values: [
                  rowAt({ 8: serialDate('2026-01-02'), 9: 'Tarjeta', 10: 'Comida', 11: 'Cena', 12: 'Restaurante', 13: 35.5 }),
                ],
              },
            ],
          },
        };
      });

      const workbook = await service.fetchWorkbook('sheet-123');

      expect(workbook.incomeRows).toEqual([
        { rowNumber: 2, fecha: new Date(Date.UTC(2026, 0, 1)), tipo: 'Nómina', concepto: 'Salario enero', valor: 1500 },
      ]);
      expect(workbook.expenseRows).toEqual([
        {
          rowNumber: 2,
          fecha: new Date(Date.UTC(2026, 0, 2)),
          tipo: 'Tarjeta',
          subtipo: 'Comida',
          concepto: 'Cena',
          tienda: 'Restaurante',
          valor: 35.5,
        },
      ]);
    });

    it('convierte el número de serie de fecha aunque la celda se muestre con formatos distintos (año a 2 y a 4 cifras)', async () => {
      // Regresión: con `FORMATTED_VALUE` una hoja real de Diego mezclaba
      // "1/1/2026" y "1/1/26" en la misma columna (formato de celda
      // heredado, no un dato distinto) — la fila con año a 2 cifras se
      // descartaba como "falta fecha". El número de serie es el mismo
      // valor para ambas, independientemente del formato de visualización.
      requestMock.mockImplementation(async ({ url }: { url: string }) => {
        if (url.includes('fields=sheets.properties.title')) {
          return { data: { sheets: [{ properties: { title: 'Ingresos' } }, { properties: { title: 'Gastos' } }] } };
        }
        return {
          data: {
            valueRanges: [
              { values: [] },
              {
                values: [rowAt({ 8: serialDate('2026-01-15'), 9: 'Tarjeta', 10: 'Comida', 11: 'Cena', 13: 20 })],
              },
            ],
          },
        };
      });

      const workbook = await service.fetchWorkbook('sheet-123');

      expect(workbook.expenseRows).toHaveLength(1);
      expect(workbook.expenseRows[0].fecha).toEqual(new Date(Date.UTC(2026, 0, 15)));
    });

    it('lanza InvalidWorkbookError si falta la pestaña "Gastos"', async () => {
      requestMock.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Ingresos' } }] } });

      await expect(service.fetchWorkbook('sheet-123')).rejects.toThrow(InvalidWorkbookError);
    });

    it('lanza GoogleSheetAccessError cuando Google devuelve 403 (sin permiso)', async () => {
      requestMock.mockRejectedValue(new GaxiosError('Forbidden', {} as never, { status: 403 } as never));

      await expect(service.fetchWorkbook('sheet-123')).rejects.toThrow(GoogleSheetAccessError);
    });

    it('lanza GoogleSheetAccessError cuando Google devuelve 404 (hoja inexistente)', async () => {
      requestMock.mockRejectedValue(new GaxiosError('Not Found', {} as never, { status: 404 } as never));

      await expect(service.fetchWorkbook('sheet-123')).rejects.toThrow(GoogleSheetAccessError);
    });

    it('envuelve cualquier otro fallo de red como GoogleSheetAccessError', async () => {
      requestMock.mockRejectedValue(new Error('network down'));

      await expect(service.fetchWorkbook('sheet-123')).rejects.toThrow(GoogleSheetAccessError);
    });
  });
});
