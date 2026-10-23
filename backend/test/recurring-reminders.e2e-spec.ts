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
import { categories, recurringTransactions, transactions, users } from '../src/db/schema/index.js';
import { RateLimitGuard } from '../src/common/rate-limit.guard.js';
import { MailService } from '../src/mail/mail.service.js';
import type { MailMessage } from '../src/mail/mail.service.js';
import { RecurringRemindersService } from '../src/recurring-transactions/recurring-reminders.service.js';

/** Captura los emails en vez de enviarlos; puede fallar a propósito para una dirección. */
class FakeMailService extends MailService {
  sent: MailMessage[] = [];
  failFor = new Set<string>();
  async send(message: MailMessage): Promise<void> {
    if (this.failFor.has(message.to)) throw new Error('SMTP caído');
    this.sent.push(message);
  }
}

describe('Avisos de recibos recurrentes (e2e) — spec 049 H1', () => {
  let app: INestApplication<App>;
  let db: Database;
  let rateLimitGuard: RateLimitGuard;
  let moduleFixture: TestingModule;
  let mail: FakeMailService;
  let reminders: RecurringRemindersService;

  const PASSWORD = 'Contraseña-Segura-123';

  beforeAll(async () => {
    mail = new FakeMailService();
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue(mail).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = moduleFixture.get<Database>(DB);
    rateLimitGuard = moduleFixture.get<RateLimitGuard>(RateLimitGuard);
    reminders = moduleFixture.get(RecurringRemindersService);
  });

  afterAll(async () => {
    await db.delete(recurringTransactions);
    await app.close();
  });

  beforeEach(async () => {
    await db.delete(recurringTransactions);
    await db.delete(transactions);
    await db.delete(categories);
    await db.delete(users);
    rateLimitGuard.resetForTests();
    mail.sent = [];
    mail.failFor.clear();
  });

  async function createUser(email: string, status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE') {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ email, passwordHash, name: 'Usuario', status }).returning();
    return user;
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken as string}`;
  }

  async function setupUser(email = 'ana@example.com') {
    const user = await createUser(email);
    const [category] = await db.insert(categories).values({ userId: user.id, type: 'EXPENSE', name: 'Seguros' }).returning();
    const token = await login(email);
    return { user, category, token };
  }

  function createTemplate(token: string, categoryId: string, extra: object = {}) {
    return request(app.getHttpServer())
      .post('/recurring-transactions')
      .set('Authorization', token)
      .send({ type: 'EXPENSE', categoryId, concept: 'Seguro hogar', amount: '30.00', frequency: 'MONTHLY', startDate: '2026-01-05', ...extra });
  }

  describe('configuración (T5.1)', () => {
    it('por defecto, una plantilla nueva no avisa y tiene 2 días de antelación', async () => {
      const { token, category } = await setupUser();
      const res = await createTemplate(token, category.id).expect(201);
      expect(res.body).toMatchObject({ reminderEnabled: false, reminderDaysBefore: 2 });
    });

    it('guarda y edita el aviso y sus días de antelación', async () => {
      const { token, category } = await setupUser();
      const created = await createTemplate(token, category.id, { reminderEnabled: true, reminderDaysBefore: 0 }).expect(201);
      expect(created.body).toMatchObject({ reminderEnabled: true, reminderDaysBefore: 0 });

      const updated = await request(app.getHttpServer())
        .patch(`/recurring-transactions/${created.body.id as string}`)
        .set('Authorization', token)
        .send({ reminderDaysBefore: 7 })
        .expect(200);
      expect(updated.body).toMatchObject({ reminderEnabled: true, reminderDaysBefore: 7 });
    });

    it('rechaza días de antelación fuera de 0..7 o no enteros', async () => {
      const { token, category } = await setupUser();
      await createTemplate(token, category.id, { reminderDaysBefore: 8 }).expect(400);
      await createTemplate(token, category.id, { reminderDaysBefore: -1 }).expect(400);
      await createTemplate(token, category.id, { reminderDaysBefore: 1.5 }).expect(400);
      await createTemplate(token, category.id, { reminderEnabled: 'sí' }).expect(400);
    });

    it('el perfil expone el interruptor global (activado por defecto) y se puede cambiar', async () => {
      const { token } = await setupUser();
      const me = await request(app.getHttpServer()).get('/users/me').set('Authorization', token).expect(200);
      expect(me.body.recurringReminderEmails).toBe(true);

      const patched = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', token)
        .send({ recurringReminderEmails: false })
        .expect(200);
      expect(patched.body.recurringReminderEmails).toBe(false);
      const again = await request(app.getHttpServer()).get('/users/me').set('Authorization', token).expect(200);
      expect(again.body.recurringReminderEmails).toBe(false);

      await request(app.getHttpServer()).patch('/users/me').set('Authorization', token).send({ recurringReminderEmails: 'no' }).expect(400);
    });
  });

  describe('envío (T5.2)', () => {
    // "Hoy" = martes 3 de noviembre de 2026. Seguro: día 5, aviso 2 días antes
    // (toca desde el 3). Luz: día 4, variable, aviso 3 días antes (desde el 1).
    const TODAY = '2026-11-03';

    async function withTwoTemplates(email = 'ana@example.com') {
      const { user, category, token } = await setupUser(email);
      const seguro = await createTemplate(token, category.id, { reminderEnabled: true, reminderDaysBefore: 2 }).expect(201);
      const luz = await createTemplate(token, category.id, {
        concept: 'Luz',
        amount: '55.00',
        startDate: '2026-01-04',
        variableAmount: true,
        reminderEnabled: true,
        reminderDaysBefore: 3,
      }).expect(201);
      return { user, category, token, seguro: seguro.body as { id: string }, luz: luz.body as { id: string } };
    }

    function post(token: string, path: string, body: object = {}) {
      return request(app.getHttpServer()).post(`/recurring-transactions${path}`).set('Authorization', token).send(body);
    }

    it('agrupa en un solo email todos los recibos que tocan hoy', async () => {
      await withTwoTemplates();
      const result = await reminders.sendDueReminders(TODAY);

      expect(result).toEqual({ emailsSent: 1, occurrencesReminded: 2 });
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0]).toMatchObject({ to: 'ana@example.com', subject: 'Próximos recibos (2)' });
      // `Intl` separa importe y "€" con un espacio no separable.
      const text = mail.sent[0].text.replace(/\u00a0/g, ' ');
      expect(text).toContain('miércoles, 4 de noviembre: Luz, ≈ −55,00 €');
      expect(text).toContain('jueves, 5 de noviembre: Seguro hogar, −30,00 €');
      expect(mail.sent[0].text).toContain('/recurring');
      expect(mail.sent[0].text).toContain('/profile');
    });

    it('cada ocurrencia avisa una sola vez: la segunda ejecución del día y la del día siguiente no repiten', async () => {
      await withTwoTemplates();
      await reminders.sendDueReminders(TODAY);
      expect(await reminders.sendDueReminders(TODAY)).toEqual({ emailsSent: 0, occurrencesReminded: 0 });
      expect(await reminders.sendDueReminders('2026-11-04')).toEqual({ emailsSent: 0, occurrencesReminded: 0 });
      expect(mail.sent).toHaveLength(1);
    });

    it('no avisa antes de tiempo ni por una fecha ya pasada', async () => {
      await withTwoTemplates();
      // El 31 de octubre aún no toca ninguno de los dos (Luz empieza el 1).
      expect((await reminders.sendDueReminders('2026-10-31')).emailsSent).toBe(0);
      // El 6 ya han pasado las dos de noviembre y las de diciembre aún no tocan.
      expect((await reminders.sendDueReminders('2026-11-06')).emailsSent).toBe(0);
    });

    it('con el interruptor global apagado no se envía nada', async () => {
      const { user } = await withTwoTemplates();
      await db.update(users).set({ recurringReminderEmails: false }).where(eq(users.id, user.id));
      expect((await reminders.sendDueReminders(TODAY)).emailsSent).toBe(0);
      expect(mail.sent).toEqual([]);
    });

    it('no avisa de plantillas pausadas ni de ocurrencias confirmadas, omitidas o conciliadas', async () => {
      const { user, category, token, seguro, luz } = await withTwoTemplates();
      await post(token, `/${seguro.id}/occurrences/2026-11-05/confirm`).expect(200);
      await post(token, `/${luz.id}/occurrences/2026-11-04/skip`).expect(204);
      expect((await reminders.sendDueReminders(TODAY)).emailsSent).toBe(0);

      // Conciliada y pausada, con otra plantilla nueva.
      const agua = await createTemplate(token, category.id, { concept: 'Agua', startDate: '2026-01-05', reminderEnabled: true }).expect(201);
      const [movement] = await db.insert(transactions).values({ userId: user.id, type: 'EXPENSE', date: '2026-11-05', categoryId: category.id, concept: 'Canal', amount: '30.00' }).returning();
      await post(token, `/${agua.body.id as string}/occurrences/2026-11-05/reconcile`, { transactionId: movement.id }).expect(204);
      const gas = await createTemplate(token, category.id, { concept: 'Gas', startDate: '2026-01-05', reminderEnabled: true }).expect(201);
      await request(app.getHttpServer()).patch(`/recurring-transactions/${gas.body.id as string}`).set('Authorization', token).send({ active: false }).expect(200);

      expect((await reminders.sendDueReminders(TODAY)).emailsSent).toBe(0);
    });

    it('no avisa de plantillas sin el aviso activado', async () => {
      const { token, category } = await setupUser();
      await createTemplate(token, category.id).expect(201);
      expect((await reminders.sendDueReminders(TODAY)).emailsSent).toBe(0);
    });

    it('no avisa a cuentas que no están activas', async () => {
      const { user } = await withTwoTemplates();
      await db.update(users).set({ status: 'PENDING_VERIFICATION' }).where(eq(users.id, user.id));
      expect((await reminders.sendDueReminders(TODAY)).emailsSent).toBe(0);
    });

    it('si el envío falla, libera las reservas y la ejecución siguiente lo reintenta', async () => {
      await withTwoTemplates();
      mail.failFor.add('ana@example.com');
      expect(await reminders.sendDueReminders(TODAY)).toEqual({ emailsSent: 0, occurrencesReminded: 0 });
      expect(await db.query.recurringRemindersSent.findMany()).toEqual([]);

      mail.failFor.clear();
      expect(await reminders.sendDueReminders(TODAY)).toEqual({ emailsSent: 1, occurrencesReminded: 2 });
    });

    it('el fallo de un usuario no impide avisar a los demás; cada uno recibe solo lo suyo', async () => {
      await withTwoTemplates('ana@example.com');
      await withTwoTemplates('bea@example.com');
      mail.failFor.add('ana@example.com');

      expect(await reminders.sendDueReminders(TODAY)).toEqual({ emailsSent: 1, occurrencesReminded: 2 });
      expect(mail.sent.map((m) => m.to)).toEqual(['bea@example.com']);
    });
  });
});
