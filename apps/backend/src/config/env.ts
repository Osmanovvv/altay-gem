import { z } from 'zod';

/**
 * Схема переменных окружения. Правило проекта (ТЗ р.14): все секреты — только
 * в env; приложение НЕ стартует без обязательных ключей и падает с понятной
 * ошибкой, а не молча.
 *
 * Обязательные сейчас: DATABASE_URL, REDIS_URL.
 * Ключи следующих этапов (Strapi, Эвотор, оплата, Telegram, MAX) объявлены
 * опциональными и становятся обязательными в своих этапах.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z
    .string({ required_error: 'обязателен, формат postgresql://user:pass@host:5432/db' })
    .min(1, 'обязателен, формат postgresql://user:pass@host:5432/db'),
  REDIS_URL: z
    .string({ required_error: 'обязателен, формат redis://host:6379' })
    .min(1, 'обязателен, формат redis://host:6379'),

  // Этап 1 — Strapi
  STRAPI_URL: z.string().optional(),
  // База ссылок на медиа для браузера (за nginx); без неё в карточки уходит
  // внутренний хост Strapi и фото не грузятся. Читается через ConfigService,
  // поэтому ОБЯЗАНА быть в схеме — иначе zod вырежет ключ.
  STRAPI_PUBLIC_URL: z.string().optional(),
  STRAPI_API_TOKEN: z.string().optional(),

  // Автоотмена неоплаченных заказов (минут); читается через ConfigService.
  ORDER_PAYMENT_TTL_MINUTES: z.coerce.number().int().positive().optional(),

  // Этап 2 — Эвотор
  EVOTOR_API_BASE: z.string().default('https://api.evotor.ru'),
  EVOTOR_APP_TOKEN: z.string().optional(),
  EVOTOR_WEBHOOK_TOKEN: z.string().optional(),
  EVOTOR_STORE_ID_LENINGRADSKAYA: z.string().optional(),
  EVOTOR_STORE_ID_TITOVA: z.string().optional(),

  // Этап 3 — оплата и уведомления
  PAYMENT_PROVIDER: z.string().optional(),
  PAYMENT_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),

  // Этап 4 — MAX
  MAX_BOT_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(корень)'}: ${issue.message}`,
    );
    throw new Error(
      `Некорректная конфигурация окружения (.env):\n${lines.join('\n')}\n` +
        'Шаблон переменных — в .env.example в корне репозитория.',
    );
  }
  return result.data;
}
