import { describe, expect, it } from 'vitest';
import { detectDocumentType } from './document-type.js';

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string) => Buffer.from(text, 'latin1');
/** Caja `ftyp` de un fichero ISO-BMFF (HEIC/AVIF) con la marca indicada. */
const ftyp = (brand: string) => Buffer.concat([bytes(0, 0, 0, 0x1c), ascii('ftyp'), ascii(brand), bytes(0, 0, 0, 0), ascii('mif1heic')]);

// Spec 048 plan.md §0 decisión 7 / §2.
describe('detectDocumentType', () => {
  it('reconoce JPEG por su cabecera', () => {
    expect(detectDocumentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
  });

  it('reconoce PNG', () => {
    expect(detectDocumentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('image/png');
  });

  it('reconoce WEBP (RIFF … WEBP), y no otro RIFF como un WAV', () => {
    expect(detectDocumentType(Buffer.concat([ascii('RIFF'), bytes(1, 2, 3, 4), ascii('WEBPVP8 ')]))).toBe('image/webp');
    expect(detectDocumentType(Buffer.concat([ascii('RIFF'), bytes(1, 2, 3, 4), ascii('WAVEfmt ')]))).toBeNull();
  });

  it('reconoce PDF', () => {
    expect(detectDocumentType(ascii('%PDF-1.7\n%âãÏÓ\n'))).toBe('application/pdf');
  });

  it('reconoce HEIC/HEIF por las marcas de su caja ftyp', () => {
    for (const brand of ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']) {
      expect(detectDocumentType(ftyp(brand))).toBe('image/heic');
    }
  });

  it('no confunde con HEIC otros ficheros ISO-BMFF (MP4, AVIF)', () => {
    expect(detectDocumentType(ftyp('isom'))).toBeNull();
    expect(detectDocumentType(ftyp('avif'))).toBeNull();
  });

  it('rechaza lo que no es un documento admitido aunque se llame .png', () => {
    expect(detectDocumentType(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectDocumentType(ascii('<!DOCTYPE html><html></html>'))).toBeNull();
    expect(detectDocumentType(bytes(0x50, 0x4b, 0x03, 0x04, 0, 0))).toBeNull(); // ZIP
    expect(detectDocumentType(Buffer.alloc(0))).toBeNull();
    expect(detectDocumentType(bytes(0xff, 0xd8))).toBeNull();
  });
});
