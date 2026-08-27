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
