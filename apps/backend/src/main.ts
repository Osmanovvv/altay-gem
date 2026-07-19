import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1'); // единый префикс API (ТЗ р.9)
  // Пуши Эвотора: vendor media type (application/vnd.evotor.v2+json) дефолтный
  // json-парсер не разбирает, а тела бывают до 5 МБ (лимит Эвотора) против
  // экспрессовских 100 КБ. Скоуп только на маршруты Эвотора — остальной API
  // остаётся на строгом дефолте.
  app.use(
    '/api/v1/evotor',
    json({ type: ['application/json', 'application/*+json'], limit: '6mb' }),
  );
  // ВАЖНО: Nest дедуплицирует боди-парсеры ПО ИМЕНИ ФУНКЦИИ ('jsonParser') и,
  // увидев скоуп-парсер выше, НЕ регистрирует свой глобальный — без этих двух
  // строк все остальные JSON-эндпоинты (заказы!) получают body === undefined.
  // Повторный разбор Эвотор-тел не происходит: body-parser пропускает уже
  // прочитанный запрос (onFinished.isFinished), поэтому 100 КБ здесь не режут 6 МБ.
  app.use(json());
  app.use(urlencoded({ extended: true }));
  // CORS: витрина (dev 8080) и будущие домены — из env (ТЗ р.14)
  const corsOrigins = (
    process.env.CORS_ORIGINS ?? 'http://localhost:8080,http://localhost:8088'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableShutdownHooks();

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
}

bootstrap().catch((err: unknown) => {
  // Понятная ошибка вместо молчаливого падения — в т.ч. при невалидном .env
  console.error(
    '[altai-backend] Запуск невозможен:\n' +
      (err instanceof Error ? err.message : String(err)),
  );
  process.exit(1);
});
