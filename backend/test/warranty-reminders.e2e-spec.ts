import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';
import type { Database } from '../src/db/db.module.js';
import { receipts, supermarkets, users, warrantyRemindersSent } from '../src/db/schema/index.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';
import { MailService } from '../src/mail/mail.service.js';
import type { MailMessage } from '../src/mail/mail.service.js';
import { WarrantyRemindersService } from '../src/groceries/warranty-reminders.service.js';

class FakeMailService extends MailService {
  sent: MailMessage[] = [];
  failFor = new Set<string>();
  async send(message: MailMessage): Promise<void> {
    if (this.failFor.has(message.to)) throw new Error('SMTP caído');
    this.sent.push(message);
  }
}

describe('Avisos de garantía (e2e) — spec 051 H5', () => {
  let app: INestApplication<App>;
  let db: Database;
  let mail: FakeMailService;
  let reminders: WarrantyRemindersService;
  const PASSWORD = 'Contraseña-Segura-123';
  const TODAY = '2026-10-24';

  beforeAll(async () => {
    mail = new FakeMailService();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue(mail).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = moduleFixture.get<Database>(DB);
    reminders = moduleFixture.get(WarrantyRemindersService);
    app.get(RateLimitGuard).resetForTests();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(users);
    mail.sent = [];
    mail.failFor.clear();
    app.get(RateLimitGuard).resetForTests();
  });

  async function setup(email = 'ana@example.com', status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Ana', status }).returning();
    const [shop] = await db.insert(supermarkets).values({ userId: user.id, name: 'Media Markt' }).returning();
    const addReceipt = async (warrantyUntil: string | null, note: string | null = null) =>
      (await db.insert(receipts).values({ userId: user.id, supermarketId: shop.id, date: '2024-10-15', printedTotal: '549.00', warrantyUntil, note }).returning())[0];
    return { user, addReceipt };
  }

  it('avisa en un solo email las garantías que caducan en 30 días o menos, sin las caducadas ni las lejanas', async () => {
    const { addReceipt } = await setup();
    const soon = await addReceipt('2026-11-23', 'Lavadora');
    const today = await addReceipt('2026-10-24');
    await addReceipt('2026-11-24'); // 31 días: todavía no
    await addReceipt('2026-10-23'); // caducada
    await addReceipt(null);

    expect(await reminders.sendDueReminders(TODAY)).toEqual({ emailsSent: 1, warrantiesReminded: 2 });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe('2 garantías caducan pronto');
    expect(mail.sent[0].text).toContain('Nota: Lavadora');
    expect(mail.sent[0].text).toContain(`/tickets/${soon.id}`);
    expect(mail.sent[0].text).toContain(`/tickets/${today.id}`);
    // Ordenadas por fecha de caducidad: primero la de hoy.
    expect(mail.sent[0].text.indexOf('caduca hoy')).toBeLessThan(mail.sent[0].text.indexOf('quedan 30 días'));
  });

  it('no repite el aviso; si cambia la fecha, vuelve a avisar respecto a la nueva', async () => {
    const { addReceipt } = await setup();
    const receipt = await addReceipt('2026-11-10');
    await reminders.sendDueReminders(TODAY);
    expect(await reminders.sendDueReminders('2026-10-25')).toEqual({ emailsSent: 0, warrantiesReminded: 0 });

    await db.update(receipts).set({ warrantyUntil: '2026-11-15' }).where(eq(receipts.id, receipt.id));
    expect(await reminders.sendDueReminders('2026-10-25')).toEqual({ emailsSent: 1, warrantiesReminded: 1 });
    expect(mail.sent).toHaveLength(2);
  });

  it('con los avisos desactivados en el perfil, o el usuario sin verificar, no se envía nada', async () => {
    const ana = await setup('ana@example.com');
    await ana.addReceipt('2026-11-01');
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'ana@example.com', password: PASSWORD }).expect(200);
    const profile = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${res.body.accessToken as string}`)
      .send({ warrantyReminderEmails: false })
      .expect(200);
    expect(profile.body.warrantyReminderEmails).toBe(false);

    const pending = await setup('pendiente@example.com', 'PENDING_VERIFICATION');
    await pending.addReceipt('2026-11-01');

    expect(await reminders.sendDueReminders(TODAY)).toEqual({ emailsSent: 0, warrantiesReminded: 0 });
    expect(mail.sent).toEqual([]);
  });

  it('un email por usuario; si falla el envío de uno, los demás se envían y el fallido se reintenta otro día', async () => {
    const ana = await setup('ana@example.com');
    const bea = await setup('bea@example.com');
    await ana.addReceipt('2026-11-01');
    await bea.addReceipt('2026-11-02');
    mail.failFor.add('ana@example.com');

    expect(await reminders.sendDueReminders(TODAY)).toEqual({ emailsSent: 1, warrantiesReminded: 1 });
    expect(mail.sent.map((m) => m.to)).toEqual(['bea@example.com']);
    expect(await db.select().from(warrantyRemindersSent)).toHaveLength(1);

    mail.failFor.clear();
    expect(await reminders.sendDueReminders('2026-10-25')).toEqual({ emailsSent: 1, warrantiesReminded: 1 });
    expect(mail.sent.map((m) => m.to)).toEqual(['bea@example.com', 'ana@example.com']);
  });

  it('el perfil trae el interruptor encendido por defecto', async () => {
    await setup('ana@example.com');
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'ana@example.com', password: PASSWORD }).expect(200);
    const profile = await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${res.body.accessToken as string}`).expect(200);
    expect(profile.body.warrantyReminderEmails).toBe(true);
  });
});
