export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Puerto (interfaz) para el envío de emails transaccionales.
 * La implementación concreta (consola en dev, un proveedor real en prod)
 * se decide en la tarea de despliegue — el resto de la app solo depende de esto.
 */
export abstract class MailService {
  abstract send(message: MailMessage): Promise<void>;
}
