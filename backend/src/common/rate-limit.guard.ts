import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Rate limiting propio, en memoria, por endpoint + IP (plan.md §4).
 *
 * Nota de implementación: se sustituye @nestjs/throttler por esto porque, en
 * el momento de implementar (NestJS 12 recién salido), ninguna versión
 * publicada de @nestjs/throttler declara compatibilidad con @nestjs/common 12
 * — instalarlo con --force rompía la resolución de módulos de @nestjs/testing
 * (ver commit). Es intencionadamente simple: suficiente para un solo proceso;
 * si se despliega con varias instancias detrás de un balanceador, esto deja
 * de ser correcto (cada instancia cuenta por separado) y habría que sustituirlo
 * por un límite compartido (Redis) — anotado como deuda técnica, no bloquea
 * esta spec.
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<RateLimitOptions | undefined>(RATE_LIMIT_KEY, context.getHandler());
    if (!options) return true; // ruta sin @RateLimit: no se limita

    const request = context.switchToHttp().getRequest<Request>();
    const key = `${request.method} ${request.route?.path ?? request.path}:${request.ip}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (bucket.count >= options.limit) {
      throw new HttpException('Demasiadas solicitudes. Inténtalo de nuevo más tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count += 1;
    return true;
  }

  /**
   * Solo para tests e2e. El bucket es un `Map` en memoria compartido por
   * TODAS las peticiones a una misma ruta+IP durante la vida de la app de
   * Nest — en un fichero de test grande (varias decenas de `login()` en la
   * misma `describe`, todas contra la misma IP de `supertest`), eso puede
   * agotar el límite real (`/auth/login`, 20 cada 15 min) sin que ningún
   * test individual haga nada mal; encontrado al añadir tests nuevos a
   * `transactions.e2e-spec.ts` (spec 006, T1.1) que hicieron que ese
   * fichero pasara de 18 a 23 logins. No se toca desde ningún código de
   * producción — nunca se llama fuera de un `beforeEach` de test.
   */
  resetForTests(): void {
    this.buckets.clear();
  }
}
