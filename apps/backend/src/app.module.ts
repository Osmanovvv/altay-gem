import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { AppController } from './app.controller';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // .env лежит в корне монорепо; локальный apps/backend/.env имеет приоритет
      envFilePath: ['.env', '../../.env'],
    }),
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
