import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

function parseCorsOrigins(): string[] {
  // CORS_ORIGIN accepts a comma-separated list (single values keep working).
  // Each Vercel preview deployment gets its own *.vercel.app hostname and
  // credentialed requests (login/refresh cookies) are rejected unless the
  // exact origin is listed — with a single static string every preview
  // build's auth silently failed until someone manually updated the env.
  const raw = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors({
    origin: parseCorsOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
