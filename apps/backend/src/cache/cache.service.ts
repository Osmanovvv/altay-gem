import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './cache.tokens';

/**
 * JSON-кеш каталога поверх Redis (ТЗ р.9: ответы каталога кешируются).
 * Redis недоступен — работаем без кеша, а не падаем: каталог важнее кеша.
 * Инвалидация по событиям Эвотора/Strapi подключается на этапе 2.
 */
@Injectable()
export class CacheService {
  private readonly log = new Logger(CacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.log.warn(`кеш недоступен (${key}): ${(err as Error).message}`);
    }
  }

  /** Снять ключи по префиксу — для будущей инвалидации по событиям. */
  async invalidatePrefix(prefix: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`${prefix}*`);
      if (keys.length) await this.redis.del(...keys);
    } catch {
      /* не критично */
    }
  }
}
