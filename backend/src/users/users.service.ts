import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import {
  bankAccountBalances,
  bankAccounts,
  cashBalances,
  cashHoldings,
  recurringOccurrenceResolutions,
  recurringTransactions,
  categories,
  cryptoPurchases,
  cryptoValuations,
  cryptos,
  expenseBudgets,
  fundDividends,
  fundPurchases,
  fundValuations,
  funds,
  pensionPlanContributions,
  pensionPlanValuations,
  pensionPlans,
  savingsGoals,
  stockDividends,
  stockPurchases,
  stockSales,
  stockValuations,
  stocks,
  transactions,
  users,
  vehicleValuations,
  vehicles,
} from '../db/schema/index.js';
import { SessionsService } from '../auth/sessions.service.js';
import { MailService } from '../mail/mail.service.js';
import { accountDeletedEmail } from '../mail/templates.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { EXPORT_FORMAT_VERSION } from '../data-export/account-export.types.js';
import type { EconomicData } from '../data-export/account-export.types.js';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  currency: string;
  locale: string;
  status: string;
  createdAt: Date;
  /**
   * H8 (spec 001), grupo 8: el frontend necesita saber, antes de pedir la
   * confirmación de borrado de cuenta, si debe pedir la contraseña o el
   * email (ver `DeleteAccountDto`) — sin esto no hay forma de decidirlo sin
   * intentar primero y fallar. Nunca se expone `passwordHash` en sí.
   */
  hasPassword: boolean;
}

/**
 * H8 (spec 001), criterio 1. Desde la spec 002 (T2.2), `economicData`
 * incluye las categorías y movimientos reales del usuario — hasta entonces
 * era un objeto placeholder explicativo (specs 002+ no existían todavía).
 * Se avisó a Diego de este cambio al revisar `spec.md` de la 002, pero no
 * quedó anotado como tarea en `plan.md`: hueco encontrado al desglosar
 * `tasks.md`, corregido aquí (T2.2), no un cambio de alcance nuevo.
 *
 * Spec 032 (plan.md §2) amplía `economicData` de 2 a las 26 tablas de datos
 * económicos que existen hoy (specs 019-031 habían quedado fuera) y añade
 * `formatVersion` — este mismo endpoint (`GET /users/me/export`) pasa a
 * servir a la vez para la obligación RGPD (H8) y como copia de seguridad
 * completa que `data-import/` sabe restaurar.
 */
export interface AccountExport {
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: string;
  profile: UserProfile;
  economicData: EconomicData;
}

type UserRow = typeof users.$inferSelect;

/**
 * H7 (spec 001). Igual que `SessionsService` (grupo 6), toda operación aquí
 * recibe `userId` explícito y opera solo sobre esa fila — nunca hay un
 * "buscar por id" sin `userId` (constitution §2, aislamiento no negociable).
 * En la práctica el `userId` siempre sale de `request.user.id` (rellenado por
 * `AuthGuard` a partir del JWT), nunca del cliente, así que no hace falta un
 * test de aislamiento cruzado dedicado como en sesiones: no existe una ruta
 * que acepte el id de *otro* usuario.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.findOrThrow(userId);
    return this.toProfile(user);
  }

  /** H7, criterio 1. PATCH parcial: solo se tocan los campos presentes en el DTO. */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const updates: Partial<UserRow> = { updatedAt: new Date() };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.currency !== undefined) updates.currency = dto.currency;
    if (dto.locale !== undefined) updates.locale = dto.locale;

    const [updated] = await this.db.update(users).set(updates).where(eq(users.id, userId)).returning();
    if (!updated) {
      throw new UnauthorizedException('El usuario ya no existe.');
    }
    return this.toProfile(updated);
  }

  /**
   * H7, criterio 2. Si la cuenta no tiene `passwordHash` (se creó solo vía
   * Google, grupo 4), no hay "contraseña actual" que confirmar — se rechaza
   * con un mensaje claro en vez de comparar contra `null` (que además
   * rompería `argon2.verify`).
   *
   * Igual que en `resetPassword` (H5, grupo 5): un cambio de contraseña
   * correcto revoca todas las sesiones activas, incluida la que hizo la
   * petición (no hay forma de identificar "esta sesión" desde el access
   * token — ver la nota en `SessionsService.listActiveForUser`). El access
   * token en curso sigue siendo válido hasta que caduque (máx. 15 min), pero
   * ya no podrá refrescarse: el mismo trade-off, ya aceptado y documentado,
   * que el reset de contraseña. tasks.md T7.1 lo marca como "(opcional)";
   * aquí se hace por consistencia con H5 y porque es el comportamiento más
   * seguro por defecto.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.findOrThrow(userId);

    if (!user.passwordHash) {
      throw new BadRequestException(
        'Esta cuenta inicia sesión solo con Google y no tiene contraseña que cambiar.',
      );
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!validPassword) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }

    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

    await this.sessions.revokeAllForUser(userId, 'PASSWORD_CHANGED');
    await this.auditLog.record('password_changed', { userId });

    return { message: 'Contraseña actualizada correctamente.' };
  }

  /**
   * H8, criterio 1 / spec 032 H1. Ver la nota de `AccountExport` — las 24
   * tablas de datos económicos del usuario (spec 032, plan.md §2). Las
   * tablas raíz (con `userId` propio) se filtran directamente; las tablas
   * hijas (sin `userId` propio, aislamiento normalizado vía su padre, igual
   * que en el resto de la app) se filtran con `inArray(<fk>, idsDelPadre)`.
   */
  async exportData(userId: string): Promise<AccountExport> {
    const user = await this.findOrThrow(userId);

    const [
      userCategories,
      userTransactions,
      userSavingsGoals,
      userExpenseBudgets,
      userBankAccounts,
      userStocks,
      userFunds,
      userCryptos,
      userVehicles,
      userPensionPlans,
      userCashHoldings,
      userRecurringTransactions,
    ] = await Promise.all([
      this.db.query.categories.findMany({ where: eq(categories.userId, userId) }),
      this.db.query.transactions.findMany({ where: eq(transactions.userId, userId) }),
      this.db.query.savingsGoals.findMany({ where: eq(savingsGoals.userId, userId) }),
      this.db.query.expenseBudgets.findMany({ where: eq(expenseBudgets.userId, userId) }),
      this.db.query.bankAccounts.findMany({ where: eq(bankAccounts.userId, userId) }),
      this.db.query.stocks.findMany({ where: eq(stocks.userId, userId) }),
      this.db.query.funds.findMany({ where: eq(funds.userId, userId) }),
      this.db.query.cryptos.findMany({ where: eq(cryptos.userId, userId) }),
      this.db.query.vehicles.findMany({ where: eq(vehicles.userId, userId) }),
      this.db.query.pensionPlans.findMany({ where: eq(pensionPlans.userId, userId) }),
      this.db.query.cashHoldings.findMany({ where: eq(cashHoldings.userId, userId) }),
      this.db.query.recurringTransactions.findMany({ where: eq(recurringTransactions.userId, userId) }),
    ]);

    const bankAccountIds = userBankAccounts.map((a) => a.id);
    const stockIds = userStocks.map((s) => s.id);
    const fundIds = userFunds.map((f) => f.id);
    const cryptoIds = userCryptos.map((c) => c.id);
    const vehicleIds = userVehicles.map((v) => v.id);
    const pensionPlanIds = userPensionPlans.map((p) => p.id);
    const cashHoldingIds = userCashHoldings.map((h) => h.id);
    const recurringIds = userRecurringTransactions.map((r) => r.id);

    const [
      userBankAccountBalances,
      userStockPurchases,
      userStockSales,
      userStockValuations,
      userStockDividends,
      userFundPurchases,
      userFundValuations,
      userFundDividends,
      userCryptoPurchases,
      userCryptoValuations,
      userVehicleValuations,
      userPensionPlanContributions,
      userPensionPlanValuations,
      userCashBalances,
      userRecurringResolutions,
    ] = await Promise.all([
      bankAccountIds.length
        ? this.db.query.bankAccountBalances.findMany({ where: inArray(bankAccountBalances.bankAccountId, bankAccountIds) })
        : [],
      stockIds.length ? this.db.query.stockPurchases.findMany({ where: inArray(stockPurchases.stockId, stockIds) }) : [],
      stockIds.length ? this.db.query.stockSales.findMany({ where: inArray(stockSales.stockId, stockIds) }) : [],
      stockIds.length ? this.db.query.stockValuations.findMany({ where: inArray(stockValuations.stockId, stockIds) }) : [],
      stockIds.length ? this.db.query.stockDividends.findMany({ where: inArray(stockDividends.stockId, stockIds) }) : [],
      fundIds.length ? this.db.query.fundPurchases.findMany({ where: inArray(fundPurchases.fundId, fundIds) }) : [],
      fundIds.length ? this.db.query.fundValuations.findMany({ where: inArray(fundValuations.fundId, fundIds) }) : [],
      fundIds.length ? this.db.query.fundDividends.findMany({ where: inArray(fundDividends.fundId, fundIds) }) : [],
      cryptoIds.length ? this.db.query.cryptoPurchases.findMany({ where: inArray(cryptoPurchases.cryptoId, cryptoIds) }) : [],
      cryptoIds.length ? this.db.query.cryptoValuations.findMany({ where: inArray(cryptoValuations.cryptoId, cryptoIds) }) : [],
      vehicleIds.length ? this.db.query.vehicleValuations.findMany({ where: inArray(vehicleValuations.vehicleId, vehicleIds) }) : [],
      pensionPlanIds.length
        ? this.db.query.pensionPlanContributions.findMany({ where: inArray(pensionPlanContributions.pensionPlanId, pensionPlanIds) })
        : [],
      pensionPlanIds.length
        ? this.db.query.pensionPlanValuations.findMany({ where: inArray(pensionPlanValuations.pensionPlanId, pensionPlanIds) })
        : [],
      cashHoldingIds.length ? this.db.query.cashBalances.findMany({ where: inArray(cashBalances.cashHoldingId, cashHoldingIds) }) : [],
      recurringIds.length
        ? this.db.query.recurringOccurrenceResolutions.findMany({ where: inArray(recurringOccurrenceResolutions.recurringId, recurringIds) })
        : [],
    ]);

    return {
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      profile: this.toProfile(user),
      economicData: {
        categories: userCategories,
        transactions: userTransactions,
        savingsGoals: userSavingsGoals,
        expenseBudgets: userExpenseBudgets,
        bankAccounts: userBankAccounts,
        bankAccountBalances: userBankAccountBalances,
        stocks: userStocks,
        stockPurchases: userStockPurchases,
        stockSales: userStockSales,
        stockValuations: userStockValuations,
        stockDividends: userStockDividends,
        funds: userFunds,
        fundPurchases: userFundPurchases,
        fundValuations: userFundValuations,
        fundDividends: userFundDividends,
        cryptos: userCryptos,
        cryptoPurchases: userCryptoPurchases,
        cryptoValuations: userCryptoValuations,
        vehicles: userVehicles,
        vehicleValuations: userVehicleValuations,
        pensionPlans: userPensionPlans,
        pensionPlanContributions: userPensionPlanContributions,
        pensionPlanValuations: userPensionPlanValuations,
        cashHoldings: userCashHoldings,
        cashBalances: userCashBalances,
        recurringTransactions: userRecurringTransactions,
        recurringOccurrenceResolutions: userRecurringResolutions,
      },
    };
  }

  /**
   * H8, criterio 2. "Reintroducir contraseña o email" se interpreta como una
   * alternativa según lo que la cuenta tenga disponible (ver `DeleteAccountDto`):
   * contraseña si la cuenta la tiene, email de confirmación si no (cuenta
   * solo-Google, mismo caso que `changePassword`).
   *
   * Criterio 3: el borrado es inmediato — se ejecuta un `DELETE` real sobre
   * la fila de `users`, no un borrado lógico. `sessions`, `oauth_accounts` y
   * `email_tokens` tienen `ON DELETE CASCADE` hacia `users.id` (definido
   * desde T0.3, verificado a nivel de BD real), así que desaparecen con ella
   * en la misma sentencia; `audit_logs.user_id` tiene `ON DELETE SET NULL`
   * — el log de auditoría no se borra (para eso existe), pero deja de
   * apuntar a ninguna cuenta.
   */
  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.findOrThrow(userId);

    if (user.passwordHash) {
      if (!dto.password) {
        throw new BadRequestException('Introduce tu contraseña para confirmar la eliminación.');
      }
      const validPassword = await argon2.verify(user.passwordHash, dto.password);
      if (!validPassword) {
        throw new UnauthorizedException('La contraseña no es correcta.');
      }
    } else {
      if (!dto.confirmEmail) {
        throw new BadRequestException(
          'Esta cuenta no tiene contraseña (inicia sesión solo con Google): reintroduce tu email para confirmar.',
        );
      }
      if (dto.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
        throw new UnauthorizedException('El email no coincide con el de tu cuenta.');
      }
    }

    // Se registra ANTES de borrar, no después: `audit_logs.user_id` exige
    // (si no es null) que el usuario referenciado exista en ese momento — y
    // es justo lo que se quiere: que la fila quede con `userId` puesto hasta
    // que el propio `DELETE` de abajo la deje en null vía `ON DELETE SET NULL`
    // (grupo 9, T9.1, acción `account_deleted`).
    await this.auditLog.record('account_deleted', { userId });

    await this.db.delete(users).where(eq(users.id, userId));

    // Aviso posterior, no confirmación previa: para cuando se envía, el
    // borrado ya es un hecho consumado e irreversible (criterio 2/3).
    await this.mail.send(accountDeletedEmail({ to: user.email, name: user.name }));
  }

  private async findOrThrow(userId: string): Promise<UserRow> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      // No debería pasar: AuthGuard ya comprueba que el usuario existe en
      // cada petición. Defensa en profundidad, no un caso esperado.
      throw new UnauthorizedException('El usuario ya no existe.');
    }
    return user;
  }

  private toProfile(user: UserRow): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currency: user.currency,
      locale: user.locale,
      status: user.status,
      createdAt: user.createdAt,
      hasPassword: user.passwordHash !== null,
    };
  }
}
