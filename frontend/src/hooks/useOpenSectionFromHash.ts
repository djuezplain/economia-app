import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Al entrar en la página (o cambiar de sub-sección del menú lateral sin
 * cambiar de página) con un hash en la URL, abre la sección `<details>` a
 * la que apunta y hace scroll hasta ella. `BrowserRouter` no hace esto de
 * fábrica (a diferencia de un data router con `<ScrollRestoration>`), y un
 * cambio de hash vía `history.pushState` (como el que hace React Router) no
 * dispara el evento nativo `hashchange`.
 *
 * `ready` evita buscar el elemento mientras la página todavía no ha
 * renderizado su contenido (pantallas de carga/error tempranas antes del
 * `<main>` con las secciones).
 */
export function useOpenSectionFromHash(ready: boolean) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!ready || !hash) return;
    const element = document.getElementById(hash.slice(1));
    if (!element) return;
    if (element instanceof HTMLDetailsElement) element.open = true;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ready, hash]);
}
