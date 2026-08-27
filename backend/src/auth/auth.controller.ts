import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard.js';
import { AuthGuard } from './guards/auth.guard.js';
import type { RequestUser } from './guards/require-active-user.guard.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';
import type { DeviceInfo } from './sessions.service.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './session-cookie.js';
import { RegisterDto } from './dto/register.dto.js';
import { VerifyEmailQueryDto } from './dto/verify-email.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('verify-email')
  verifyEmail(@Query() query: VerifyEmailQueryDto) {
    return this.authService.verifyEmail(query.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  // Evita usar el reenvío para acosar una bandeja de entrada o tantear qué emails existen.
  @RateLimit({ limit: 5, windowMs: 5 * 60 * 1000 })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  // Defensa en profundidad además del bloqueo por cuenta (que es el control
  // principal, H4 criterio 3): límite generoso por IP para no interferir con
  // usuarios legítimos que fallan la contraseña alguna vez.
  @RateLimit({ limit: 20, windowMs: 15 * 60 * 1000 })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.authService.login(dto, deviceInfoFrom(req));
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    return { accessToken, user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw new UnauthorizedException('No hay sesión que refrescar.');
    }

    const { accessToken, refreshToken: newRefreshToken } = await this.sessions.rotate(
      refreshToken,
      deviceInfoFrom(req),
    );
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions());
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async logout(@Req() req: Request & { user: RequestUser }, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await this.sessions.revokeByRefreshToken(refreshToken, req.user.id);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    return { message: 'Sesión cerrada.' };
  }
}

function deviceInfoFrom(req: Request): DeviceInfo {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}
