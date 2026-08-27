import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RequestUser, RequireActiveUserGuard } from './require-active-user.guard.js';

function contextWithUser(user: RequestUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RequireActiveUserGuard', () => {
  const guard = new RequireActiveUserGuard();

  it('permite el paso a un usuario ACTIVE', () => {
    expect(guard.canActivate(contextWithUser({ id: '1', status: 'ACTIVE' }))).toBe(true);
  });

  it('rechaza a un usuario PENDING_VERIFICATION', () => {
    expect(() => guard.canActivate(contextWithUser({ id: '1', status: 'PENDING_VERIFICATION' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza a un usuario DISABLED', () => {
    expect(() => guard.canActivate(contextWithUser({ id: '1', status: 'DISABLED' }))).toThrow(ForbiddenException);
  });

  it('rechaza si no hay usuario autenticado en el request', () => {
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(UnauthorizedException);
  });
});
