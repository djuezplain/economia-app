import { MailMessage } from './mail.service.js';

/**
 * Plantillas de los emails transaccionales de la spec 001 (auth).
 * Cada función es pura: datos de entrada -> MailMessage. Fáciles de testear
 * sin levantar ningún servicio real de correo.
 */

export function verificationEmail(params: { to: string; name: string; verifyUrl: string }): MailMessage {
  const { to, name, verifyUrl } = params;
  return {
    to,
    subject: 'Confirma tu cuenta',
    text: `Hola ${name},\n\nConfirma tu cuenta entrando en este enlace (caduca en 24 horas):\n${verifyUrl}\n\nSi no has creado esta cuenta, ignora este email.`,
    html: `<p>Hola ${name},</p><p>Confirma tu cuenta haciendo clic en el siguiente enlace (caduca en 24 horas):</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Si no has creado esta cuenta, ignora este email.</p>`,
  };
}

export function alreadyRegisteredEmail(params: { to: string; name: string; forgotPasswordUrl: string }): MailMessage {
  const { to, name, forgotPasswordUrl } = params;
  return {
    to,
    subject: 'Ya tienes una cuenta',
    text: `Hola ${name},\n\nAlguien ha intentado registrarse con este email, pero ya tienes una cuenta. Si has sido tú y no recuerdas tu contraseña, puedes restablecerla aquí:\n${forgotPasswordUrl}\n\nSi no has sido tú, puedes ignorar este email.`,
    html: `<p>Hola ${name},</p><p>Alguien ha intentado registrarse con este email, pero ya tienes una cuenta. Si has sido tú y no recuerdas tu contraseña, puedes restablecerla aquí:</p><p><a href="${forgotPasswordUrl}">${forgotPasswordUrl}</a></p><p>Si no has sido tú, puedes ignorar este email.</p>`,
  };
}

export function passwordResetEmail(params: { to: string; name: string; resetUrl: string }): MailMessage {
  const { to, name, resetUrl } = params;
  return {
    to,
    subject: 'Restablece tu contraseña',
    text: `Hola ${name},\n\nRestablece tu contraseña entrando en este enlace (caduca en 1 hora):\n${resetUrl}\n\nSi no lo has pedido tú, ignora este email; tu contraseña actual sigue funcionando.`,
    html: `<p>Hola ${name},</p><p>Restablece tu contraseña haciendo clic en el siguiente enlace (caduca en 1 hora):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si no lo has pedido tú, ignora este email; tu contraseña actual sigue funcionando.</p>`,
  };
}

/**
 * H8 (spec 001), grupo 8. Se envía DESPUÉS de borrar la cuenta (plan.md §6):
 * es un aviso, no una confirmación previa — para entonces el borrado ya es
 * irreversible y no hay marcha atrás posible desde este email. Va a la
 * última dirección de correo conocida de la cuenta, capturada antes de
 * borrar la fila de `users`.
 */
export function accountDeletedEmail(params: { to: string; name: string }): MailMessage {
  const { to, name } = params;
  return {
    to,
    subject: 'Tu cuenta ha sido eliminada',
    text: `Hola ${name},\n\nTu cuenta y todos los datos asociados (sesiones, vínculos de inicio de sesión, etc.) se han eliminado de forma permanente e inmediata, como pediste.\n\nSi no has sido tú quien ha pedido esto, contacta con nosotros lo antes posible.`,
    html: `<p>Hola ${name},</p><p>Tu cuenta y todos los datos asociados (sesiones, vínculos de inicio de sesión, etc.) se han eliminado de forma permanente e inmediata, como pediste.</p><p>Si no has sido tú quien ha pedido esto, contacta con nosotros lo antes posible.</p>`,
  };
}

/** Spec 049: los conceptos los escribe el usuario; nunca se insertan sin escapar en el HTML. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface RecurringReminderItem {
  /** Fecha ya formateada para leer (p. ej. "26 de octubre"). */
  date: string;
  concept: string;
  /** Importe ya formateado con su moneda (p. ej. "64,20 €"). */
  amount: string;
  /** Spec 049 H2 criterio 3: el importe es una estimación. */
  estimated: boolean;
  isIncome: boolean;
}

/**
 * Spec 049 H1 (plan.md §3.5): un único email con todos los recibos que
 * tocaba avisar ese día. Al pie, cómo desactivar los avisos (H1 criterio 6).
 */
export function recurringRemindersEmail(params: {
  to: string;
  name: string;
  items: RecurringReminderItem[];
  recurringUrl: string;
  profileUrl: string;
}): MailMessage {
  const { to, name, items, recurringUrl, profileUrl } = params;
  const amountText = (i: RecurringReminderItem) => `${i.estimated ? '≈ ' : ''}${i.isIncome ? '+' : '−'}${i.amount}`;
  const subject = items.length === 1 ? `Próximo recibo: ${items[0].concept}` : `Próximos recibos (${items.length})`;

  const textLines = items.map((i) => `- ${i.date}: ${i.concept}, ${amountText(i)}`).join('\n');
  const htmlItems = items
    .map((i) => `<li><strong>${escapeHtml(i.date)}</strong>: ${escapeHtml(i.concept)}, ${escapeHtml(amountText(i))}</li>`)
    .join('');
  const estimateNote = items.some((i) => i.estimated) ? 'Los importes con "≈" son una estimación a partir de tus últimos recibos.' : '';

  return {
    to,
    subject,
    text:
      `Hola ${name},\n\nEstos son tus próximos recibos:\n${textLines}\n\n` +
      (estimateNote ? `${estimateNote}\n\n` : '') +
      `Puedes verlos y confirmarlos en ${recurringUrl}\n\n` +
      `Si no quieres recibir estos avisos, desactívalos en tu perfil: ${profileUrl}`,
    html:
      `<p>Hola ${escapeHtml(name)},</p><p>Estos son tus próximos recibos:</p><ul>${htmlItems}</ul>` +
      (estimateNote ? `<p>${escapeHtml(estimateNote)}</p>` : '') +
      `<p><a href="${recurringUrl}">Ver y confirmar en Recurrentes</a></p>` +
      `<p style="color:#666;font-size:12px">Si no quieres recibir estos avisos, <a href="${profileUrl}">desactívalos en tu perfil</a>.</p>`,
  };
}

export interface WarrantyReminderItem {
  merchant: string;
  /** Fechas ya formateadas para leer (p. ej. "15 de octubre de 2026"). */
  receiptDate: string;
  warrantyUntil: string;
  /** Días que quedan (0 = caduca hoy). */
  daysLeft: number;
  note: string | null;
  receiptUrl: string;
}

/** Notas largas: en el email basta el principio. */
function shortNote(note: string): string {
  const flat = note.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

function daysLeftText(days: number): string {
  if (days === 0) return 'caduca hoy';
  return days === 1 ? 'queda 1 día' : `quedan ${days} días`;
}

/**
 * Spec 051 H5 criterio 3: un email con las garantías que caducan en los
 * próximos 30 días, con el comercio, la fecha del ticket, la nota y un
 * enlace a cada ticket. Al pie, cómo desactivar los avisos (criterio 4).
 * El comercio y la nota los escribe el usuario: se escapan en el HTML.
 */
export function warrantyRemindersEmail(params: { to: string; name: string; items: WarrantyReminderItem[]; profileUrl: string }): MailMessage {
  const { to, name, items, profileUrl } = params;
  const subject = items.length === 1 ? `La garantía de tu compra en ${items[0].merchant} caduca pronto` : `${items.length} garantías caducan pronto`;
  const line = (i: WarrantyReminderItem) =>
    `${i.merchant} (ticket del ${i.receiptDate}): garantía hasta el ${i.warrantyUntil}, ${daysLeftText(i.daysLeft)}`;

  const textLines = items.map((i) => `- ${line(i)}${i.note ? `\n  Nota: ${shortNote(i.note)}` : ''}\n  ${i.receiptUrl}`).join('\n');
  const htmlItems = items
    .map(
      (i) =>
        `<li><a href="${i.receiptUrl}"><strong>${escapeHtml(i.merchant)}</strong></a> (ticket del ${escapeHtml(i.receiptDate)}): ` +
        `garantía hasta el <strong>${escapeHtml(i.warrantyUntil)}</strong>, ${daysLeftText(i.daysLeft)}` +
        (i.note ? `<br><span style="color:#666">Nota: ${escapeHtml(shortNote(i.note))}</span>` : '') +
        `</li>`,
    )
    .join('');

  return {
    to,
    subject,
    text:
      `Hola ${name},\n\nEstas garantías caducan pronto:\n${textLines}\n\n` +
      `Si algo falla, todavía estás a tiempo de reclamar con el ticket.\n\n` +
      `Si no quieres recibir estos avisos, desactívalos en tu perfil: ${profileUrl}`,
    html:
      `<p>Hola ${escapeHtml(name)},</p><p>Estas garantías caducan pronto:</p><ul>${htmlItems}</ul>` +
      `<p>Si algo falla, todavía estás a tiempo de reclamar con el ticket.</p>` +
      `<p style="color:#666;font-size:12px">Si no quieres recibir estos avisos, <a href="${profileUrl}">desactívalos en tu perfil</a>.</p>`,
  };
}
