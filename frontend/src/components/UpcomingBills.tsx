import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOccurrences } from '../api/recurring-transactions';
import type { Occurrence } from '../api/recurring-transactions';
import { formatCurrency, formatDate } from '../pages/home-shared';
import { todayIso } from '../pages/movements-shared';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Hacia atrás para las vencidas sin resolver (plan.md §4). */
const OVERDUE_LOOKBACK_DAYS = 90;
/** Hacia delante: lo que vence en la próxima semana (H1 criterio 5). */
const UPCOMING_DAYS = 7;

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Spec 049 H1 criterio 5. Sección "Próximos recibos" de Inicio: las
 * ocurrencias que vencen en los próximos 7 días y las vencidas sin
 * resolver (primero), tengan o no el aviso por email activado. Si no hay
 * ninguna, o falla la carga, no se pinta nada: es un extra de Inicio, no
 * debe ensuciarlo con errores. El llamador solo la monta con conexión.
 */
export function UpcomingBills() {
  const [items, setItems] = useState<Occurrence[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = todayIso();
        const occurrences = await listOccurrences(shiftDays(today, -OVERDUE_LOOKBACK_DAYS), shiftDays(today, UPCOMING_DAYS));
        const open = occurrences
          .filter((o) => o.status === 'PENDING' || o.status === 'OVERDUE')
          .sort((a, b) => Number(b.status === 'OVERDUE') - Number(a.status === 'OVERDUE') || a.date.localeCompare(b.date));
        if (!cancelled) setItems(open);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section aria-label="Próximos recibos">
      <h2>Próximos recibos</h2>
      <ul id="home-upcoming-bills">
        {items.map((o) => {
          const isIncome = o.type === 'INCOME';
          return (
            <li key={`${o.recurringId}|${o.date}`}>
              <span className={`dot${isIncome ? ' dot-accent' : ''}`} aria-hidden="true" />
              <span>
                <Link to="/recurring">
                  <strong>{o.concept}</strong>
                </Link>{' '}
                {o.status === 'OVERDUE' && <span className="tag tag-accent">vencido</span>}
                <br />
                <small>{formatDate(o.date)}</small>
              </span>
              <span className={o.estimated ? 'amount-estimated' : undefined}>
                {o.estimated ? '≈ ' : ''}
                {isIncome ? '+' : '-'}
                {formatCurrency(o.amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
