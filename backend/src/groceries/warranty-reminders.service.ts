import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { receipts, supermarkets, users, warrantyRemindersSent } from '../db/schema/index.js';
import { MailService } from '../mail/mail.service.js';
import { warrantyRemindersEmail } from '../mail/templates.js';
import { WARRANTY_NOTICE_DAYS, warrantyRemindersDue } from './receipt-warranty.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

export interface WarrantyRemindersRunResult {
  /** Emails enviados (uno por usuario como mucho). */
  emailsSent: number;
  /** Garantías avisadas en total. */
  warrantiesReminded: number;
}

/**
 * Spec 051 H5 criterio 3 / plan.md §3.2. Mismo mecanismo que los avisos de
 * recibos de la spec 049 (`RecurringRemindersService`): lo llama el
 * scheduler una vez al día con `today` (en Madrid); por cada usuario activo
 * con los avisos encendidos, reserva en `warranty_reminders_sent` las
 * garantías que caducan en 30 días o menos y no se han avisado para esa
 * fecha, y manda un solo email. Si el envío falla, libera las reservas para
 * reintentar al día siguiente. Un fallo de un usuario no para a los demás.
 */
@Injectable()
export class WarrantyRemindersService {
  private readonly logger = new Logger(WarrantyRemindersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async sendDueReminders(today: string): Promise<WarrantyRemindersRunResult> {
    const rows = await this.db
      .select({
        receiptId: receipts.id,
        warrantyUntil: receipts.warrantyUntil,
        receiptDate: receipts.date,
        note: receipts.note,
        merchant: supermarkets.name,
        userId: users.id,
        email: users.email,
        name: users.name,
      })
      .from(receipts)
      .innerJoin(users, eq(users.id, receipts.userId))
      .innerJoin(supermarkets, eq(supermarkets.id, receipts.supermarketId))
      .where(
        and(
          isNotNull(receipts.warrantyUntil),
          gte(receipts.warrantyUntil, today),
          lte(receipts.warrantyUntil, shiftDays(today, WARRANTY_NOTICE_DAYS)),
          eq(users.status, 'ACTIVE'),
          eq(users.warrantyReminderEmails, true),
        ),
      );
    if (rows.length === 0) return { emailsSent: 0, warrantiesReminded: 0 };

    const candidates = rows.map((r) => ({ ...r, warrantyUntil: r.warrantyUntil! }));
    const sent = await this.db
      .select({ receiptId: warrantyRemindersSent.receiptId, warrantyUntil: warrantyRemindersSent.warrantyUntil })
      .from(warrantyRemindersSent)
      .where(inArray(warrantyRemindersSent.receiptId, candidates.map((c) => c.receiptId)));
    const due = warrantyRemindersDue(candidates, sent, today);

    const byUser = new Map<string, typeof due>();
    for (const row of due) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

    const result: WarrantyRemindersRunResult = { emailsSent: 0, warrantiesReminded: 0 };
    for (const items of byUser.values()) {
      try {
        const reminded = await this.remindUser(items, today);
        if (reminded > 0) {
          result.emailsSent += 1;
          result.warrantiesReminded += reminded;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`No se han podido enviar los avisos de garantía del usuario ${items[0].userId}: ${message}`);
      }
    }
    return result;
  }

  private async remindUser(
    items: { receiptId: string; warrantyUntil: string; receiptDate: string; note: string | null; merchant: string; email: string; name: string }[],
    today: string,
  ): Promise<number> {
    // Reserva antes de enviar: si dos ejecuciones coinciden, solo una avisa (PK).
    const reserved = await this.db
      .insert(warrantyRemindersSent)
      .values(items.map((i) => ({ receiptId: i.receiptId, warrantyUntil: i.warrantyUntil })))
      .onConflictDoNothing()
      .returning({ receiptId: warrantyRemindersSent.receiptId, warrantyUntil: warrantyRemindersSent.warrantyUntil });
    if (reserved.length === 0) return 0;

    const reservedKeys = new Set(reserved.map((r) => `${r.receiptId}|${r.warrantyUntil}`));
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const toSend = items
      .filter((i) => reservedKeys.has(`${i.receiptId}|${i.warrantyUntil}`))
      .sort((a, b) => a.warrantyUntil.localeCompare(b.warrantyUntil));

    try {
      await this.mail.send(
        warrantyRemindersEmail({
          to: items[0].email,
          name: items[0].name,
          items: toSend.map((i) => ({
            merchant: i.merchant,
            receiptDate: formatDate(i.receiptDate),
            warrantyUntil: formatDate(i.warrantyUntil),
            daysLeft: Math.round((Date.parse(`${i.warrantyUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS),
            note: i.note,
            receiptUrl: `${frontendUrl}/tickets/${i.receiptId}`,
          })),
          profileUrl: `${frontendUrl}/profile`,
        }),
      );
    } catch (err) {
      for (const r of reserved) {
        await this.db
          .delete(warrantyRemindersSent)
          .where(and(eq(warrantyRemindersSent.receiptId, r.receiptId), eq(warrantyRemindersSent.warrantyUntil, r.warrantyUntil)));
      }
      throw err;
    }
    return reserved.length;
  }
}
