import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { AppController } from './app.controller';
import { CacheModule } from './cache/cache.module';
import { CatalogModule } from './catalog/catalog.module';
import { validateEnv } from './config/env';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health/health.controller';
import { PromocodesModule } from './promocodes/promocodes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // .env лежит в корне монорепо; локальный apps/backend/.env имеет приоритет
      envFilePath: ['.env', '../../.env'],
    }),
    DatabaseModule,
    CacheModule,
    CatalogModule,
    PromocodesModule,
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: IncomingMessage) =>
          (req.headers['x-request-id'] as string) ?? randomUUID(),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      },
    }),
  ],
  controllers: [AppController, HealthController],
})
export class AppModule {}
