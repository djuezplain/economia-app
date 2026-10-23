import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { recurringOccurrenceResolutions, recurringRemindersSent, recurringTransactions, users } from '../db/schema/index.js';
import { MailService } from '../mail/mail.service.js';
import { recurringRemindersEmail } from '../mail/templates.js';
import { occurrencesBetween } from './recurring.calculations.js';
import { reminderKey, remindersDue } from './recurring.reminders.js';
import { loadExpectedAmounts } from './recurring-estimates.query.js';
import type { RecurringTransaction } from './recurring-transactions.service.js';

/** Máximo de días de antelación (CHECK de la columna): basta mirar esta ventana. */
const MAX_DAYS_BEFORE = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** La app no guarda zona horaria por usuario (plan.md §3.5): es la de Diego. */
export const REMINDERS_TIME_ZONE = 'Europe/Madrid';

/** 'YYYY-MM-DD' de `now` en `REMINDERS_TIME_ZONE` (no en UTC). */
export function todayInRemindersTimeZone(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: REMINDERS_TIME_ZONE }).format(now);
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

function formatAmount(amount: string, currency: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(amount));
}

export interface RemindersRunResult {
  /** Emails enviados (uno por usuario como mucho). */
  emailsSent: number;
  /** Ocurrencias avisadas en total. */
  occurrencesReminded: number;
}

/**
 * Spec 049 H1 / plan.md §3.5. Lo llama `RecurringRemindersScheduler` una vez
 * al día; recibe `today` para poder probarlo con una fecha fija.
 *
 * Por cada usuario activo con el interruptor global encendido: calcula las
 * ocurrencias pendientes de sus plantillas con aviso que tocan hoy
 * (`remindersDue`), las reserva en `recurring_reminders_sent` y manda **un
 * solo** email con las que haya podido reservar. Si el envío falla, libera
 * esas reservas para que la ejecución siguiente lo reintente. Un fallo de un
 * usuario no interrumpe a los demás.
 */
@Injectable()
export class RecurringRemindersService {
  private readonly logger = new Logger(RecurringRemindersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async sendDueReminders(today: string): Promise<RemindersRunResult> {
    const rows = await this.db
      .select({ template: recurringTransactions, user: users })
      .from(recurringTransactions)
      .innerJoin(users, eq(users.id, recurringTransactions.userId))
      .where(
        and(
          eq(recurringTransactions.active, true),
          eq(recurringTransactions.reminderEnabled, true),
          eq(users.status, 'ACTIVE'),
          eq(users.recurringReminderEmails, true),
        ),
      );

    const byUser = new Map<string, { user: (typeof rows)[number]['user']; templates: RecurringTransaction[] }>();
    for (const row of rows) {
      const entry = byUser.get(row.user.id) ?? { user: row.user, templates: [] };
      entry.templates.push(row.template);
      byUser.set(row.user.id, entry);
    }

    const result: RemindersRunResult = { emailsSent: 0, occurrencesReminded: 0 };
    for (const { user, templates } of byUser.values()) {
      try {
        const reminded = await this.remindUser(user, templates, today);
        if (reminded > 0) {
          result.emailsSent += 1;
          result.occurrencesReminded += reminded;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`No se han podido enviar los avisos de recibos del usuario ${user.id}: ${message}`);
      }
    }
    return result;
  }

  private async remindUser(
    user: { id: string; email: string; name: string; currency: string },
    templates: RecurringTransaction[],
    today: string,
  ): Promise<number> {
    const to = shiftDays(today, MAX_DAYS_BEFORE);
    const templateIds = templates.map((t) => t.id);

    const [resolved, sent] = await Promise.all([
      this.db
        .select({ recurringId: recurringOccurrenceResolutions.recurringId, date: recurringOccurrenceResolutions.occurrenceDate })
        .from(recurringOccurrenceResolutions)
        .where(
          and(
            inArray(recurringOccurrenceResolutions.recurringId, templateIds),
            gte(recurringOccurrenceResolutions.occurrenceDate, today),
            lte(recurringOccurrenceResolutions.occurrenceDate, to),
          ),
        ),
      this.db
        .select({ recurringId: recurringRemindersSent.recurringId, date: recurringRemindersSent.occurrenceDate })
        .from(recurringRemindersSent)
        .where(
          and(
            inArray(recurringRemindersSent.recurringId, templateIds),
            gte(recurringRemindersSent.occurrenceDate, today),
            lte(recurringRemindersSent.occurrenceDate, to),
          ),
        ),
    ]);
    const resolvedKeys = new Set(resolved.map((r) => reminderKey(r.recurringId, r.date)));
    const alreadySent = new Set(sent.map((s) => reminderKey(s.recurringId, s.date)));

    const templateById = new Map(templates.map((t) => [t.id, t]));
    const pending = templates.flatMap((t) =>
      occurrencesBetween(t, today, to)
        .filter((date) => !resolvedKeys.has(reminderKey(t.id, date)))
        .map((date) => ({ recurringId: t.id, date, reminderDaysBefore: t.reminderDaysBefore })),
    );
    const due = remindersDue(pending, today, alreadySent);
    if (due.length === 0) return 0;

    // Reserva antes de enviar: si dos ejecuciones coinciden, solo una se
    // queda cada ocurrencia (PK) y nadie la avisa dos veces.
    const reserved = await this.db
      .insert(recurringRemindersSent)
      .values(due.map((d) => ({ recurringId: d.recurringId, occurrenceDate: d.date })))
      .onConflictDoNothing()
      .returning({ recurringId: recurringRemindersSent.recurringId, date: recurringRemindersSent.occurrenceDate });
    if (reserved.length === 0) return 0;

    const expected = await loadExpectedAmounts(this.db, user.id, templates);
    const items = reserved
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => {
        const t = templateById.get(r.recurringId)!;
        return {
          date: formatDay(r.date),
          concept: t.concept,
          amount: formatAmount(expected.get(t.id)!, user.currency),
          estimated: t.variableAmount,
          isIncome: t.type === 'INCOME',
        };
      });

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    try {
      await this.mail.send(
        recurringRemindersEmail({
          to: user.email,
          name: user.name,
          items,
          recurringUrl: `${frontendUrl}/recurring`,
          profileUrl: `${frontendUrl}/profile`,
        }),
      );
    } catch (err) {
      // Libera las reservas para reintentar en la próxima ejecución.
      for (const r of reserved) {
        await this.db
          .delete(recurringRemindersSent)
          .where(and(eq(recurringRemindersSent.recurringId, r.recurringId), eq(recurringRemindersSent.occurrenceDate, r.date)));
      }
      throw err;
    }
    return reserved.length;
  }
}
