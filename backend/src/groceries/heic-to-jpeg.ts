import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

/**
 * Spec 048 T0.2: convertir un HEIC de 12 MP con `heic-convert` (WASM) tarda
 * segundos en la Raspberry Pi y bloquearía el bucle de eventos — el backend
 * dejaría de atender cualquier otra petición mientras tanto. Se hace en un
 * hilo aparte. El código del hilo va en línea (`eval: true`), no en un
 * fichero `.ts` aparte, para que funcione igual compilado (`dist/`) y en
 * los tests (Vitest ejecuta TypeScript, un `Worker` no).
 */
const HEIC_CONVERT_PATH = createRequire(import.meta.url).resolve('heic-convert');
const TIMEOUT_MS = 120_000;

const WORKER_CODE = `
const { parentPort, workerData } = require('node:worker_threads');
const convert = require(workerData.modulePath);
convert({ buffer: workerData.input, format: 'JPEG', quality: 0.85 })
  .then((output) => parentPort.postMessage({ ok: true, output: Buffer.from(output) }))
  .catch((err) => parentPort.postMessage({ ok: false, message: String(err && err.message ? err.message : err) }));
`;

export function heicToJpeg(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_CODE, { eval: true, workerData: { input, modulePath: HEIC_CONVERT_PATH } });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('La conversión de la foto HEIC ha tardado demasiado.'));
    }, TIMEOUT_MS);
    worker.once('message', (message: { ok: true; output: Uint8Array } | { ok: false; message: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (message.ok) resolve(Buffer.from(message.output));
      else reject(new Error(message.message));
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
