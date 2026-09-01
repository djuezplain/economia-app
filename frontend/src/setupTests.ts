import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';
import { resetDBConnection } from './offline/db';

// jsdom no implementa IndexedDB; `AuthContext` (spec 011, modo offline) la
// usa en cuanto hay sesión (`ensureUserScope`/`syncFullHistory`), así que
// casi cualquier test de una página autenticada la necesita disponible, no
// solo los tests dedicados de `offline/`. Se resetea entre tests para que
// ningún test lea datos cacheados por otro.
beforeEach(() => {
  indexedDB = new IDBFactory();
  resetDBConnection();
});
