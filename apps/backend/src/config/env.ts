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

  // Админка владельца (этап 2, Вариант A: раздел «Заказы»).
  // Без ОБОИХ ключей вход в админку отключён (login отдаёт 503).
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  // Публичный адрес сайта — для ссылки «Открыть заказ» в Telegram-уведомлении.
  PUBLIC_SITE_URL: z.string().optional(),

  // Этап 2 — Эвотор. ДВА разных токена (перепутать — ошибка №1 интеграции):
  // CLOUD — юзер-токен Облака (по нему МЫ ходим в api.evotor.ru; штатно
  //   приходит сам при установке приложения, env — ручной запасной вариант);
  // WEBHOOK — токен из вкладки «Интеграция» кабинета (по нему ЭВОТОР
  //   авторизует свои push-и К НАМ).
  EVOTOR_API_BASE: z.string().default('https://api.evotor.ru'),
  EVOTOR_CLOUD_TOKEN: z.string().optional(),
  EVOTOR_WEBHOOK_TOKEN: z.string().optional(),
  EVOTOR_STORE_ID_LENINGRADSKAYA: z.string().optional(),
  EVOTOR_STORE_ID_TITOVA: z.string().optional(),
  // Страховочный поллинг документов (ТЗ р.10.3 — доставка вебхуков не
  // гарантируется): период в минутах (0 = выкл) и окно дочитки в часах.
  EVOTOR_POLL_MINUTES: z.coerce.number().int().nonnegative().optional(),
  EVOTOR_POLL_LOOKBACK_HOURS: z.coerce.number().int().positive().optional(),
  // Ночная сверка из суточной выгрузки (ТЗ-5, Шаг 6). DIR — куда падают файлы
  // выгрузки с именем <storeId>.xlsx (автодоставка отчёта — операционка); без
  // DIR сверка выключена. AT — время запуска «ЧЧ:ММ» локального времени сервера.
  EVOTOR_RECONCILE_DIR: z.string().optional(),
  EVOTOR_RECONCILE_AT: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/, 'формат ЧЧ:ММ')
    .optional(),
  // Мониторинг интеграции (ТЗ р.10.3 п.9): период health-проверки (мин, 0=выкл),
  // порог «сверка устарела» (ч) и «событие висит в failed» (мин) для алертов.
  EVOTOR_HEALTH_MINUTES: z.coerce.number().int().nonnegative().optional(),
  EVOTOR_RECONCILE_MAX_AGE_HOURS: z.coerce.number().int().positive().optional(),
  EVOTOR_FAILED_EVENT_MINUTES: z.coerce.number().int().positive().optional(),
  // Страховка от УСТАРЕВШЕЙ выгрузки: файл старше N часов сверка не применяет
  // (иначе откатит остатки, насчитанные чеками, к старому снимку) — пропуск и
  // алерт. По умолчанию 26 ч (суточный файл + запас). 0 — проверку выключить.
  EVOTOR_RECONCILE_MAX_FILE_AGE_HOURS: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional(),
  // Буфер против двойной продажи (ТЗ п.8, Путь B): сколько единиц НЕ показывать
  // к продаже (последний экземпляр придержан под офлайн-кассу). По умолчанию 1.
  EVOTOR_STOCK_SAFETY_BUFFER: z.coerce.number().int().nonnegative().optional(),

  // Этап 3 — оплата и уведомления
  PAYMENT_PROVIDER: z.string().optional(),
  PAYMENT_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  // ЮKassa (эквайер онлайн-оплаты): shopId + секретный ключ из ЛК магазина
  // заказчицы. Пусто — оплата не создаётся (заказ без paymentUrl), чтобы код
  // жил на проде ДО прихода боевых/тестовых ключей. API-база одна для теста и
  // прода — тест/прод определяет пара ключей (тестовый магазин = тестовые ключи).
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  YOOKASSA_API_BASE: z.string().optional(),
  // Вебхук результата оплаты (шаг 2). У ЮKassa нет подписи — верифицируем
  // перезапросом платежа (главный контроль) + IP-списком. 'true' → отклонять
  // уведомления с IP вне списка ЮKassa; по умолчанию (пусто) только логируем,
  // чтобы неверный парсинг X-Forwarded-For не «подвесил» реальную оплату.
  YOOKASSA_WEBHOOK_VERIFY_IP: z.string().optional(),
  // Чек 54-ФЗ (шаг 3): ЮKassa фискализирует объект receipt при оплате. 'true' —
  // прикладывать чек к платежу. Значения зависят от СНО/учётной политики
  // заказчицы (подтверждает её бухгалтер): VAT_CODE (1 Без НДС=УСН … 4 НДС20%),
  // PAYMENT_MODE (full_payment | full_prepayment), TAX_SYSTEM_CODE (СНО 1..6,
  // только если у аккаунта несколько), RECEIPT_MEASURE (ед. изм. для ФФД 1.2).
  YOOKASSA_RECEIPT_ENABLED: z.string().optional(),
  // 1..6 базовые + 11/12 (НДС 22% и 22/122, с 01.01.2026). УСН заказчицы = 1.
  YOOKASSA_VAT_CODE: z.coerce.number().int().min(1).max(12).optional(),
  YOOKASSA_PAYMENT_MODE: z.string().optional(),
  YOOKASSA_TAX_SYSTEM_CODE: z.coerce.number().int().min(1).max(6).optional(),
  YOOKASSA_RECEIPT_MEASURE: z.string().optional(),
  // Часовой пояс отложенного чека (шаг 4, обязателен при маркировке):
  // 1..11 = UTC+2..UTC+12. Новосибирск (UTC+7) = 6.
  YOOKASSA_RECEIPT_TIMEZONE: z.coerce.number().int().min(1).max(11).optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),
  // Чат тех-алертов исполнителю (сбой сверки/недоставка вебхуков, ТЗ п.9);
  // не задан — алерты идут в TELEGRAM_ADMIN_CHAT_ID.
  TELEGRAM_ALERT_CHAT_ID: z.string().optional(),

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
