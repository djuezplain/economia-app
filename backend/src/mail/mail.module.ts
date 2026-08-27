import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { ConsoleMailService } from './console-mail.service.js';

@Module({
  providers: [{ provide: MailService, useClass: ConsoleMailService }],
  exports: [MailService],
})
export class MailModule {}
