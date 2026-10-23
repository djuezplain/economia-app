import { todayInRemindersTimeZone } from './recurring-reminders.service.js';

// Spec 049 plan.md §3.5: "hoy" de los avisos es el día en Madrid, no en UTC.
describe('todayInRemindersTimeZone', () => {
  it('a las 00:30 de Madrid en horario de verano (22:30 UTC del día anterior) ya es el día siguiente', () => {
    expect(todayInRemindersTimeZone(new Date('2026-10-22T22:30:00Z'))).toBe('2026-10-23');
  });

  it('en horario de invierno (UTC+1) también', () => {
    expect(todayInRemindersTimeZone(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });

  it('a las 8:00 de Madrid devuelve ese mismo día', () => {
    expect(todayInRemindersTimeZone(new Date('2026-11-03T07:00:00Z'))).toBe('2026-11-03');
  });
});
