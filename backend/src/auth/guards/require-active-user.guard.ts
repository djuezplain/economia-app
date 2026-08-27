import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Forma mínima del usuario que un guard de autenticación (AuthGuard, grupo 3
 * de tasks.md) debe dejar en `request.user`. Se define aquí, no en el AuthGuard,
 * porque este guard debe poder compilarse y testearse de forma aislada antes
 * de que exista AuthGuard.
 */
export interface RequestUser {
  id: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
}

/**
 * H2 (spec 001), criterio 3: mientras la cuenta no esté ACTIVE, no puede
 * operar sobre datos económicos (que aún no existen — specs 002+). Este guard
 * se deja listo desde ya y se aplicará con `@UseGuards(AuthGuard, RequireActiveUserGuard)`
 * en cuanto exista AuthGuard (grupo 3): en ese orden, porque este guard asume
 * que `request.user` ya lo ha rellenado un guard de autenticación anterior.
 */
@Injectable()
export class RequireActiveUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    if (!user) {
      // No debería ocurrir si el guard se coloca después de un AuthGuard real,
      // pero no se asume: sin usuario autenticado, no hay nada que verificar aquí.
      throw new UnauthorizedException('No autenticado.');
    }
    if (user.status === 'DISABLED') {
      throw new ForbiddenException('Esta cuenta está deshabilitada.');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Verifica tu email para acceder a esta función.');
    }
    return true;
  }
}
