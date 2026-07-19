import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Схема БД бэкенда (этап 1, шаг 1).
 *
 * Принципы (ТЗ р.4, 8, 10):
 * - Реплика номенклатуры Эвотора — по каждому магазину отдельно
 *   (PK: store_id + evotor_uuid). Товары двух магазинов «идентичны»,
 *   но UUID-ы в каждом магазине свои — матчинг через match_key
 *   (штрихкод → артикул → нормализованное имя).
 * - Витринные данные (фото, описания, категории, промокоды, тарифы) живут
 *   в Strapi и здесь НЕ дублируются; в этой БД — только транзакционное:
 *   заказы, резервы, журнал применений промокодов, журналы синка/вебхуков.
 * - Деньги — в копейках (integer), количества — numeric(12,3)
 *   (кг с точностью до грамма), количество в заказе — целые порции/штуки.
 */

// ---------- enums ----------

export const orderStatusEnum = pgEnum('order_status', [
  'new', //             создан, офлайн-оплата (самовывоз)
  'awaiting_payment', //ждёт онлайн-оплаты (автоотмена через 30 мин)
  'paid', //            оплачен
  'assembling', //      собирается
  'ready_for_pickup', //готов к выдаче (самовывоз)
  'shipped', //         передан в доставку
  'completed', //       выполнен
  'cancelled', //       отменён (вручную или автоотмена)
]);

export const deliveryMethodEnum = pgEnum('delivery_method', [
  'pickup_leningradskaya', // самовывоз — Ленинградская 75/2
  'pickup_titova', //         самовывоз — Титова 32
  'courier_nsk', //           курьер по Новосибирску
  'russia', //                СДЭК / Почта России
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'online', //         картой онлайн / СБП (Цифровая касса)
  'cash_on_pickup', // наличными при получении (только самовывоз)
  'card_on_pickup', // картой при получении (только самовывоз)
]);

export const orderSourceEnum = pgEnum('order_source', ['web', 'max']);

export const reservationStatusEnum = pgEnum('reservation_status', [
  'active', //    держит остаток
  'released', //  отпущен (отмена/автоотмена)
  'committed', // списан в продажу
]);

export const syncDirectionEnum = pgEnum('sync_direction', ['import', 'export']);

export const syncStatusEnum = pgEnum('sync_status', ['ok', 'error']);

export const webhookSourceEnum = pgEnum('webhook_source', [
  'evotor',
  'payment',
]);

export const webhookStatusEnum = pgEnum('webhook_status', [
  'received',
  'processed',
  'failed',
]);

// ---------- эвотор: магазины и реплика товаров ----------

/** Справочник магазинов Эвотора (2 точки клиента). */
export const evotorStores = pgTable('evotor_stores', {
  id: uuid('id').primaryKey(), // store_id из Эвотора
  name: text('name').notNull(),
  address: text('address'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Реплика номенклатуры Эвотора, по магазину. Наполняется импортом/вебхуками. */
export const evotorProducts = pgTable(
  'evotor_products',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => evotorStores.id),
    evotorUuid: uuid('evotor_uuid').notNull(),
    name: text('name').notNull(),
    priceKopecks: integer('price_kopecks').notNull().default(0),
    costPriceKopecks: integer('cost_price_kopecks'),
    /** Остаток в единицах товара (шт — целые, кг — до грамма). */
    quantity: numeric('quantity', { precision: 12, scale: 3 })
      .notNull()
      .default('0'),
    measure: text('measure').notNull().default('шт'), // 'шт' | 'кг' | ...
    groupUuid: uuid('group_uuid'),
    groupName: text('group_name'),
    barcodes: text('barcodes').array().notNull().default([]),
    article: text('article'),
    code: text('code'),
    /** Тип Эвотора: NORMAL, DAIRY_MARKED, WATER_MARKED и т.п. */
    evotorType: text('evotor_type').notNull().default('NORMAL'),
    /** Признак маркировки («Честный знак») — производное от evotor_type. */
    isMarked: boolean('is_marked').notNull().default(false),
    allowToSell: boolean('allow_to_sell').notNull().default(true),
    /** Архивирован/удалён в Эвоторе (реплику не удаляем — заказы ссылаются). */
    isArchived: boolean('is_archived').notNull().default(false),
    /**
     * Ключ матчинга «одинаковых» товаров между магазинами:
     * первый штрихкод → артикул → нормализованное имя. Заполняется синком.
     */
    matchKey: text('match_key').notNull(),
    /** Полный ответ Эвотора — для отладки и будущих полей. */
    raw: jsonb('raw'),
    syncedAt: timestamp('synced_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.evotorUuid] }),
    index('evotor_products_match_key_idx').on(t.matchKey),
    index('evotor_products_group_idx').on(t.groupUuid),
    index('evotor_products_updated_idx').on(t.updatedAt),
  ],
);

/**
 * Установки нашего приложения в ЛК Эвотора (этап 2, ТЗ р.10).
 * При установке Эвотор POST-ит per-installation токен на наш
 * /user/token — им авторизуются ВСЕ наши запросы к Cloud API.
 * Уведомление об удалении переводит установку в active=false.
 */
export const evotorInstallations = pgTable('evotor_installations', {
  /** ID пользователя Эвотора (формат 01-000000000000001) — ключ арендатора. */
  userId: text('user_id').primaryKey(),
  /** Токен Облака Эвотор для этой установки (секрет — наружу не отдавать). */
  token: text('token').notNull(),
  active: boolean('active').notNull().default(true),
  installedAt: timestamp('installed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  uninstalledAt: timestamp('uninstalled_at', { withTimezone: true }),
  /**
   * Бизнес-время последнего ПРИМЕНЁННОГО события жизненного цикла
   * (timestamp из тела ApplicationInstalled/Uninstalled). Guard против
   * запоздавших ретраев сравнивает именно с ним — updated_at «грязнится»
   * доставкой токена и для этого не годится.
   */
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------- заказы ----------

export const orders = pgTable(
  'orders',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Человекочитаемый номер: ALT-000042. Генерируется из id. */
    orderNumber: text('order_number').notNull(),
    /** Токен доступа к публичной странице /order/{id}?t=... (ТЗ р.9). */
    accessToken: uuid('access_token').notNull().defaultRandom(),
    status: orderStatusEnum('status').notNull().default('new'),

    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerEmail: text('customer_email'),

    deliveryMethod: deliveryMethodEnum('delivery_method').notNull(),
    deliveryAddress: text('delivery_address'),
    deliveryCostKopecks: integer('delivery_cost_kopecks').notNull().default(0),

    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    /** ID платежа во внешнем платёжном сервисе (этап 3). */
    paymentExternalId: text('payment_external_id'),
    /**
     * ID отложенного фискального чека ЮKassa (шаг 4): маркированный заказ
     * фискализируется ПОСЛЕ сборки (POST /receipts). null — чек ещё не выбит
     * (или заказ фискализирован при оплате обычным путём).
     */
    fiscalReceiptId: text('fiscal_receipt_id'),

    /** Применённый промокод (сам промокод живёт в Strapi). */
    promoCode: text('promo_code'),
    promoDiscountKopecks: integer('promo_discount_kopecks')
      .notNull()
      .default(0),

    itemsSubtotalKopecks: integer('items_subtotal_kopecks').notNull(),
    totalKopecks: integer('total_kopecks').notNull(),

    source: orderSourceEnum('source').notNull().default('web'),
    comment: text('comment'),
    cancelReason: text('cancel_reason'),

    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_order_number_idx').on(t.orderNumber),
    uniqueIndex('orders_access_token_idx').on(t.accessToken),
    index('orders_status_idx').on(t.status),
    index('orders_created_idx').on(t.createdAt),
    index('orders_phone_idx').on(t.customerPhone),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** Ссылка на товар Эвотора (магазин списания фиксируется на этапе 2/3). */
    storeId: uuid('store_id'),
    evotorUuid: uuid('evotor_uuid'),
    /** Денормализация на момент заказа — история не зависит от каталога. */
    name: text('name').notNull(),
    priceKopecks: integer('price_kopecks').notNull(),
    oldPriceKopecks: integer('old_price_kopecks'),
    /** Количество в единицах продажи сайта: штуки или ПОРЦИИ (целое). */
    quantity: integer('quantity').notNull(),
    /** Для весовых: масса порции в граммах (100 по умолчанию из Strapi). */
    portionMassG: integer('portion_mass_g'),
    unit: text('unit').notNull().default('шт'),
    isMarked: boolean('is_marked').notNull().default(false),
    /**
     * Коды маркировки Data Matrix, отсканированные при сборке (шаг 4) — ровно
     * по одному НА ЕДИНИЦУ товара (полнота: length == quantity). null — ещё
     * не сканировали (или товар не маркированный).
     */
    markCodes: text('mark_codes').array(),
    /**
     * Подпадала ли строка под скидку промокода на момент заказа (категорийный
     * промокод действует только на свою категорию) — нужно отложенному чеку
     * (шаг 4), который строится из этого снапшота без каталога.
     */
    discountEligible: boolean('discount_eligible').notNull().default(true),
    sumKopecks: integer('sum_kopecks').notNull(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

// ---------- резервы остатков ----------

/**
 * Резерв уменьшает доступный к продаже остаток немедленно (ТЗ р.8.2);
 * освобождается при отмене/автоотмене, коммитится при списании в Эвотор.
 * Количество — в ЕДИНИЦАХ ТОВАРА Эвотора (для весовых — кг: порции × 0.1).
 */
export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull(),
    evotorUuid: uuid('evotor_uuid').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    status: reservationStatusEnum('status').notNull().default('active'),
    /** До какого момента резерв держит остаток (автоотмена — 30 мин). */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('reservations_order_idx').on(t.orderId),
    index('reservations_product_idx').on(t.storeId, t.evotorUuid),
    index('reservations_active_idx').on(t.status, t.expiresAt),
  ],
);

// ---------- промокоды: журнал применений ----------

/**
 * Сами промокоды — модель Strapi (ТЗ р.7.2). Здесь только факт применения:
 * это счётчик «лимита применений» и фиксация скидки в заказе (ТЗ р.8.3).
 */
export const promocodeUsages = pgTable(
  'promocode_usages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    code: text('code').notNull(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    discountKopecks: integer('discount_kopecks').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('promocode_usages_code_idx').on(t.code),
    uniqueIndex('promocode_usages_order_idx').on(t.orderId),
  ],
);

// ---------- журналы: синк, вебхуки, идемпотентность ----------

/** Журнал операций обмена с Эвотором (ТЗ р.10.3, хранение ≥90 дней). */
export const syncLog = pgTable(
  'sync_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    direction: syncDirectionEnum('direction').notNull(),
    /** product | stock | receipt | reconciliation | ... */
    entity: text('entity').notNull(),
    storeId: uuid('store_id'),
    evotorUuid: uuid('evotor_uuid'),
    status: syncStatusEnum('status').notNull(),
    payload: jsonb('payload'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('sync_log_created_idx').on(t.createdAt),
    index('sync_log_entity_idx').on(t.entity, t.status),
  ],
);

/** Входящие вебхуки (Эвотор, платёжный сервис): журнал + дедупликация. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    source: webhookSourceEnum('source').notNull(),
    /** Ключ дедупликации: id события/чека/платежа у источника. */
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    status: webhookStatusEnum('status').notNull().default('received'),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Время ПЕРВОЙ доставки — неизменяемое (received_at обновляется при
     * повторном claim-е). Служит меткой свежести для абсолютных остатков
     * из push-ей без собственного timestamp.
     */
    firstReceivedAt: timestamp('first_received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('webhook_events_dedup_idx').on(t.source, t.eventId),
    index('webhook_events_received_idx').on(t.receivedAt),
  ],
);

/** Идемпотентность мутирующих эндпоинтов (POST /orders — ТЗ р.9). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idempotency_created_idx').on(t.createdAt)],
);
