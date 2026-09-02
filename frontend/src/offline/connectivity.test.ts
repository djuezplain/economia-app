import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkNow, isOnline, resetForTests, subscribe } from './connectivity';

function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value, writable: true, configurable: true });
}

describe('offline/connectivity (T6.1)', () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
    resetForTests(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isOnline() devuelve el estado conocido sin disparar ninguna comprobación', () => {
    expect(isOnline()).toBe(true);
  });

  it('checkNow(): si navigator.onLine es false, no llega a llamar a fetch y marca offline', async () => {
    setNavigatorOnLine(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await checkNow();

    expect(result).toBe(false);
    expect(isOnline()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('checkNow(): navigator.onLine=true y /health responde ok → online', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const result = await checkNow();

    expect(result).toBe(true);
    expect(isOnline()).toBe(true);
  });

  it('checkNow(): navigator.onLine=true pero /health responde con error → offline (backend caído)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const result = await checkNow();

    expect(result).toBe(false);
    expect(isOnline()).toBe(false);
  });

  it('checkNow(): navigator.onLine=true pero la petición falla (red inalcanzable) → offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await checkNow();

    expect(result).toBe(false);
    expect(isOnline()).toBe(false);
  });

  it('subscribe(): notifica a los listeners cuando el estado cambia, y deja de notificar tras desuscribirse', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await checkNow();
    expect(listener).toHaveBeenCalledWith(false);

    unsubscribe();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await checkNow();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe(): no notifica si el estado no cambia', async () => {
    const listener = vi.fn();
    subscribe(listener);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await checkNow(); // ya estaba online (resetForTests(true))

    expect(listener).not.toHaveBeenCalled();
  });
});
