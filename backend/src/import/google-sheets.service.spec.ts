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
function rowAt(values: Record<number, string>): string[] {
  const row: string[] = [];
  for (const [col, value] of Object.entries(values)) row[Number(col) - 1] = value;
  return row;
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
        return {
          data: {
            valueRanges: [
              { values: [rowAt({ 7: '01/01/2026', 8: 'Nómina', 9: 'Salario enero', 10: '1500.00' }), []] },
              {
                values: [
                  rowAt({ 8: '02/01/2026', 9: 'Tarjeta', 10: 'Comida', 11: 'Cena', 12: 'Restaurante', 13: '35.50' }),
                ],
              },
            ],
          },
        };
      });

      const workbook = await service.fetchWorkbook('sheet-123');

      expect(workbook.incomeRows).toEqual([{ rowNumber: 2, fecha: '01/01/2026', tipo: 'Nómina', concepto: 'Salario enero', valor: '1500.00' }]);
      expect(workbook.expenseRows).toEqual([
        { rowNumber: 2, fecha: '02/01/2026', tipo: 'Tarjeta', subtipo: 'Comida', concepto: 'Cena', tienda: 'Restaurante', valor: '35.50' },
      ]);
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
