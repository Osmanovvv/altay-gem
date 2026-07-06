import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Client } from 'pg';

type CheckResult = 'ok' | 'fail';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  /** Liveness: процесс жив. Без внешних зависимостей — для nginx/оркестратора. */
  @Get()
  liveness() {
    return { status: 'ok' };
  }

  /**
   * Readiness: готов ли сервис обслуживать запросы — проверяет PostgreSQL и
   * Redis. 503 с деталями, если что-то недоступно. Пока соединения разовые;
   * после появления постоянных пулов (backbone) переедет на них.
   */
  @Get('ready')
  async readiness() {
    const checks: Record<string, CheckResult> = {
      postgres: 'fail',
      redis: 'fail',
    };

    const pg = new Client({
      connectionString: this.config.get<string>('DATABASE_URL'),
      connectionTimeoutMillis: 2000,
    });
    try {
      await pg.connect();
      await pg.query('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      /* столбец checks уже 'fail' */
    } finally {
      await pg.end().catch(() => undefined);
    }

    const redis = new Redis(this.config.get<string>('REDIS_URL', ''), {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    try {
      await redis.connect();
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      /* столбец checks уже 'fail' */
    } finally {
      redis.disconnect();
    }

    if (Object.values(checks).some((c) => c !== 'ok')) {
      throw new ServiceUnavailableException({ status: 'not_ready', checks });
    }
    return { status: 'ok', checks };
  }
}
