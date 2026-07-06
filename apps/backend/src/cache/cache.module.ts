import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS } from './cache.tokens';

class RedisShutdown implements OnApplicationShutdown {
  constructor(private readonly redis: Redis) {}
  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL', ''), {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        }),
    },
    CacheService,
    {
      provide: RedisShutdown,
      inject: [REDIS],
      useFactory: (redis: Redis) => new RedisShutdown(redis),
    },
  ],
  exports: [CacheService, REDIS],
})
export class CacheModule {}
