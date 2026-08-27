import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DB } from '../../db/db.module.js';
import type { Database } from '../../db/db.module.js';
import { users } from '../../db/schema/index.js';
import type { RequestUser } from './require-active-user.guard.js';

/**
 * Extrae y valida el access token (JWT) del header Authorization, y deja el
 * usuario en `request.user` para el resto de la cadena (p. ej.
 * RequireActiveUserGuard, o los controladores). Se aplica explícitamente con
 * `@UseGuards(AuthGuard)` en cada ruta protegida — no es un guard global de
 * Nest (APP_GUARD), porque la mayoría de rutas de /auth son públicas
 * (login, registro, refresh...) y deben seguir siéndolo.
 *
 * Se resuelve el usuario contra la BD en cada petición (en vez de fiarse solo
 * del payload del JWT) para que un cambio de estado (p. ej. DISABLED) tenga
 * efecto inmediato sin esperar a que el access token expire.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('No autenticado.');
    }

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token inválido o caducado.');
    }

    const user = await this.db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (!user) {
      throw new UnauthorizedException('El usuario ya no existe.');
    }

    request.user = { id: user.id, status: user.status };
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
