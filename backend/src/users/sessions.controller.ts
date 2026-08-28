import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { SessionsService } from '../auth/sessions.service.js';

/**
 * H6 (spec 001). Se aplica solo `AuthGuard`, no `RequireActiveUserGuard`:
 * gestionar las propias sesiones es una función de seguridad de la cuenta,
 * no una operación sobre datos económicos — debe seguir disponible aunque el
 * email todavía no esté verificado.
 */
@Controller('users/me/sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.sessions.listActiveForUser(req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request & { user: RequestUser },
  ): Promise<void> {
    const revoked = await this.sessions.revokeById(id, req.user.id);
    if (!revoked) {
      // 404, no 403 (plan.md §3 / tasks.md T6.1): así no se confirma si esa
      // sesión existe pero es de otro usuario, o si simplemente no existe.
      throw new NotFoundException('Sesión no encontrada.');
    }
  }
}
