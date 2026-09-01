import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';
import { resetDBConnection } from './offline/db';
import { resetForTests as resetConnectivity } from './offline/connectivity';
import { resetForTests as resetQueueProcessor } from './offline/queueProcessor';

// jsdom no implementa IndexedDB; `AuthContext` (spec 011, modo offline) la
// usa en cuanto hay sesión (`ensureUserScope`/`syncFullHistory`), así que
// casi cualquier test de una página autenticada la necesita disponible, no
// solo los tests dedicados de `offline/`. Se resetea entre tests para que
// ningún test lea datos cacheados por otro.
//
// `offline/connectivity.ts` y `offline/queueProcessor.ts` guardan estado en
// variables de módulo (estado de conexión, ejecución en curso del
// procesador, listeners suscritos) que sobrevive entre tests dentro del
// mismo fichero si no se resetea explícitamente — un test que deja una
// ejecución de `processQueue()` a medias puede hacer que el siguiente test
// del mismo fichero reciba esa misma ejecución en vez de una nueva.
beforeEach(() => {
  indexedDB = new IDBFactory();
  resetDBConnection();
  resetConnectivity(true);
  resetQueueProcessor();
});
