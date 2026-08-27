import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
