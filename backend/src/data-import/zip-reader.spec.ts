import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import { afterAll, describe, expect, it } from 'vitest';
import { ZipFormatError, ZipReader } from './zip-reader.js';

const dir = mkdtempSync(join(tmpdir(), 'zip-reader-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function buildZip(entries: Record<string, Buffer>): Promise<string> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(entries)) zip.addBuffer(content, name);
  zip.end();
  const chunks: Buffer[] = [];
  return new Promise((resolve) => {
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => {
      const path = join(dir, `${Math.random()}.zip`);
      writeFileSync(path, Buffer.concat(chunks));
      resolve(path);
    });
  });
}

// Spec 048 T6.3.
describe('ZipReader', () => {
  it('lee solo las entradas pedidas por nombre exacto', async () => {
    const reader = await ZipReader.open(await buildZip({ 'datos.json': Buffer.from('{}'), 'documentos/a.jpg': Buffer.from('abc') }));
    expect(reader.has('documentos/a.jpg')).toBe(true);
    expect(reader.size('documentos/a.jpg')).toBe(3);
    expect((await reader.read('documentos/a.jpg', 10)).toString()).toBe('abc');
    await expect(reader.read('documentos/b.jpg', 10)).rejects.toBeInstanceOf(ZipFormatError);
    reader.close();
  });

  it('no lee una entrada mayor que el máximo pedido', async () => {
    const reader = await ZipReader.open(await buildZip({ 'datos.json': Buffer.alloc(100) }));
    await expect(reader.read('datos.json', 50)).rejects.toThrow(/demasiado grande/);
    reader.close();
  });

  it('rechaza un fichero que no es un .zip', async () => {
    const path = join(dir, 'no-zip.zip');
    writeFileSync(path, 'esto no es un zip');
    await expect(ZipReader.open(path)).rejects.toBeInstanceOf(ZipFormatError);
  });

  it('detecta una entrada que declara un tamaño falso', async () => {
    const path = await buildZip({ 'datos.json': Buffer.from('{"a":1}'), 'documentos/a.jpg': Buffer.from('contenido real de la foto') });
    // Se rebaja el tamaño descomprimido declarado de la entrada en el directorio central.
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(path);
    const name = Buffer.from('documentos/a.jpg');
    let idx = bytes.lastIndexOf(name);
    const header = idx - 46; // inicio de la cabecera del directorio central de esa entrada
    expect(bytes.readUInt32LE(header)).toBe(0x02014b50);
    bytes.writeUInt32LE(3, header + 24); // uncompressed size
    idx = bytes.indexOf(name);
    bytes.writeUInt32LE(3, idx - 30 + 22); // y en la cabecera local
    writeFileSync(path, bytes);

    const reader = await ZipReader.open(path);
    await expect(reader.read('documentos/a.jpg', 1000)).rejects.toBeInstanceOf(ZipFormatError);
    reader.close();
  });
});
