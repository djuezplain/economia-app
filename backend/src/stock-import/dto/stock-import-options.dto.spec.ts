import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { StockImportOptionsDto } from './stock-import-options.dto.js';

describe('StockImportOptionsDto', () => {
  it('un campo ausente se interpreta como "incluir" (H6 criterio 1)', async () => {
    const instance = plainToInstance(StockImportOptionsDto, {});
    expect(instance).toMatchObject({ includePurchases: true, includeSales: true, includeValuations: true });
    expect(await validate(instance)).toHaveLength(0);
  });

  it('"true" (texto, tal como llega de un formulario) se interpreta como incluir', async () => {
    const instance = plainToInstance(StockImportOptionsDto, { includePurchases: 'true', includeSales: 'true', includeValuations: 'true' });
    expect(instance).toMatchObject({ includePurchases: true, includeSales: true, includeValuations: true });
  });

  it('"false" (texto) se interpreta como excluir, sin afectar a los demás campos', async () => {
    const instance = plainToInstance(StockImportOptionsDto, { includeSales: 'false' });
    expect(instance).toMatchObject({ includePurchases: true, includeSales: false, includeValuations: true });
    expect(await validate(instance)).toHaveLength(0);
  });
});
