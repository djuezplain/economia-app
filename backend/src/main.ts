import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // `session-cookie.ts` (refreshCookieOptions): decide si la cookie de
  // refresh es `secure` a partir de `req.secure`. Sin confiar en el proxy,
  // Express nunca mira `X-Forwarded-Proto` — necesario para que el
  // Cloudflare Tunnel opcional (deploy/README.md §9), que llega al backend
  // por HTTP plano dentro de la red de Docker aunque el cliente use HTTPS
  // de verdad, siga marcando la cookie como segura en vez de perder esa
  // protección. Único proxy posible delante en este despliegue (un único
  // salto, red de Docker propia) — `true` es seguro aquí.
  app.set('trust proxy', true);
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true });
  // Necesario para leer la cookie httpOnly del refresh token (login/refresh/logout).
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos no declarados en el DTO
      forbidNonWhitelisted: true, // y falla si llegan campos extra
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
