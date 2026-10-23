import { reminderKey, remindersDue } from './recurring.reminders.js';
import type { PendingOccurrence } from './recurring.reminders.js';

function pending(date: string, reminderDaysBefore: number, recurringId = 'rec-seguro'): PendingOccurrence {
  return { recurringId, date, reminderDaysBefore };
}

// Spec 049 H1 / plan.md §2: avisa desde `fecha − días` hasta la propia fecha
// (ambas incluidas), una sola vez, y nunca por una fecha ya pasada.
describe('remindersDue', () => {
  it('con 2 días de antelación avisa desde 2 días antes hasta el mismo día', () => {
    const o = pending('2026-11-05', 2);
    expect(remindersDue([o], '2026-11-02', new Set())).toEqual([]);
    expect(remindersDue([o], '2026-11-03', new Set())).toEqual([o]);
    expect(remindersDue([o], '2026-11-05', new Set())).toEqual([o]);
  });

  it('con 0 días solo avisa el mismo día', () => {
    const o = pending('2026-11-05', 0);
    expect(remindersDue([o], '2026-11-04', new Set())).toEqual([]);
    expect(remindersDue([o], '2026-11-05', new Set())).toEqual([o]);
  });

  it('con 7 días avisa desde una semana antes, también cruzando de mes', () => {
    const o = pending('2026-12-03', 7);
    expect(remindersDue([o], '2026-11-25', new Set())).toEqual([]);
    expect(remindersDue([o], '2026-11-26', new Set())).toEqual([o]);
  });

  it('no avisa por una ocurrencia cuya fecha ya pasó', () => {
    expect(remindersDue([pending('2026-11-05', 7)], '2026-11-06', new Set())).toEqual([]);
  });

  it('no repite una ocurrencia ya avisada', () => {
    const o = pending('2026-11-05', 2);
    expect(remindersDue([o], '2026-11-04', new Set([reminderKey('rec-seguro', '2026-11-05')]))).toEqual([]);
  });

  it('devuelve solo las que tocan, de varias plantillas', () => {
    const due = pending('2026-11-05', 3, 'rec-a');
    const notYet = pending('2026-11-20', 3, 'rec-b');
    expect(remindersDue([due, notYet], '2026-11-04', new Set())).toEqual([due]);
  });
});
