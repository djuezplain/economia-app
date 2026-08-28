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
import { ConfigService } from '@nestjs/config';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
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
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { GoogleConfiguredGuard } from './google/google-configured.guard.js';
import type { GoogleProfile } from './google/google.strategy.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionsService,
    private readonly config: ConfigService,
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

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  // Mismo motivo que en resend-verification: evita usarlo para acosar una
  // bandeja de entrada o tantear qué emails existen.
  @RateLimit({ limit: 5, windowMs: 5 * 60 * 1000 })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Get('google')
  @UseGuards(GoogleConfiguredGuard, PassportAuthGuard('google'))
  googleLogin() {
    // AuthGuard('google') intercepta la petición y redirige a Google antes
    // de que este método llegue a ejecutarse (plan.md §5, paso 1-2).
  }

  @Get('google/callback')
  @UseGuards(GoogleConfiguredGuard, PassportAuthGuard('google'))
  async googleCallback(@Req() req: Request & { user: GoogleProfile }, @Res() res: Response) {
    const { accessToken, refreshToken } = await this.authService.loginWithGoogleProfile(
      req.user,
      deviceInfoFrom(req),
    );
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

    // Esta ruta la visita el navegador con una navegación completa (Google
    // redirige aquí directamente, no es una llamada fetch del frontend), así
    // que no se puede devolver JSON: se redirige de vuelta al frontend con el
    // access token en la query string para que la SPA lo recoja y lo guarde
    // en memoria. Trade-off documentado en constitution.md: el token queda
    // brevemente visible en la URL/historial del navegador hasta que el
    // frontend lo retira de la barra de direcciones al leerlo.
    const redirectUrl = new URL('/oauth-callback', this.config.getOrThrow<string>('FRONTEND_URL'));
    redirectUrl.searchParams.set('accessToken', accessToken);
    res.redirect(redirectUrl.toString());
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
