import { Injectable, Logger } from '@nestjs/common';
import { MailMessage, MailService } from './mail.service.js';

/**
 * Implementación de desarrollo: no envía nada de verdad, solo lo loguea.
 * Sustituir por un proveedor real (Resend, SMTP, SES...) en la tarea de
 * despliegue a producción — el resto de la app no cambia porque depende
 * de la interfaz `MailService`, no de esta clase.
 */
@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger(ConsoleMailService.name);

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[DEV EMAIL] Para: ${message.to} · Asunto: ${message.subject}`);
    this.logger.debug(message.text);
  }
}
