import { useEffect, useState } from 'react';
import { isOnline, subscribe } from '../offline/connectivity';

/** Spec 011 (modo offline). Envoltorio React de `offline/connectivity.ts` — se suscribe a los cambios de estado mientras el componente está montado. */
export function useConnectivity(): boolean {
  const [online, setOnlineState] = useState(isOnline());

  useEffect(() => subscribe(setOnlineState), []);

  return online;
}
