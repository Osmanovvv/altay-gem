import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { CatalogService, ProductInternal } from '../catalog/catalog.service';
import { orderableUnits, safePortionMassG } from '../catalog/stock';
import { DB, type Database } from '../db/database.module';
import {
  evotorStores,
  idempotencyKeys,
  orderItems,
  orders,
  promocodeUsages,
  stockReservations,
  webhookEvents,
} from '../db/schema';
import { TelegramService } from '../notifications/telegram.service';
import { PromocodesService } from '../promocodes/promocodes.service';
import { idempotencyDecision } from './idempotency';
import {
  blocksHandoffWithoutOffsetReceipt,
  canTransition,
} from './order-status';
import { PaymentService } from './payment.service';
import { mergeDuplicateItems } from './merge-items';
import {
  isPickupPoint,
  otherPickupPoint,
  resolvePickupStores,
  type PickupPoint,
} from './pickup-points';
import {
  RECEIPT_MAX_ITEMS,
  buildPostPaymentReceipt,
  buildReceipt,
  discountZeroesMarkedLine,
  receiptPositionsUpperBound,
  rubToKopecks,
  type Receipt,
  type ReceiptConfig,
} from './receipt';
import type { AuthoritativePayment } from './yookassa';
import {
  decidePaymentAction,
  ipAllowed,
  parseWebhookNotification,
  type WebhookNotification,
} from './yookassa-webhook';
import { StrapiService } from '../strapi/strapi.service';
import {
  calcDelivery,
  DeliveryMethod,
  DeliveryNotAvailableError,
  DeliveryTariffs,
} from './delivery';
import type { CreateOrderDto } from './dto/create-order.dto';

interface ItemProblem {
  id: string;
  reason: 'unknown_item' | 'out_of_stock' | 'price_changed';
  availableQty?: number;
  actualPriceRub?: number;
}

/** Нехватка остатка в целевом магазине quote (+ подсказка другой точки). */
type QuoteStockProblem = {
  id: string;
  availableQty: number;
  otherPickup?: { point: PickupPoint; availableQty: number };
};

export interface OrderResponse {
  id: number;
  orderNumber: string;
  accessToken: string;
  status: string;
  totals: {
    subtotalRub: number;
    discountRub: number;
    deliveryRub: number;
    totalRub: number;
  };
  paymentUrl: string | null; // появится на этапе 3 (Цифровая касса)
}

/**
 * Заглушка Idempotency-Key старше этого срока считается брошенной (владелец
 * упал до записи ответа) и перезахватывается — см. idempotencyDecision.
 */
const IDEM_STALE_MS = 60_000;

/** Статусы заказа (совпадают с orderStatusEnum схемы). */
export const ORDER_STATUSES = [
  'new',
  'awaiting_payment',
  'paid',
  'assembling',
  'ready_for_pickup',
  'shipped',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OrdersService.name);
  private readonly paymentTtlMin: number;
  /** Буфер против двойной продажи: не даём заказать N придержанных единиц (ТЗ п.8). */
  private readonly safetyBuffer: number;
  /** База для return_url ЮKassa (куда вернуть покупателя после оплаты). */
  private readonly siteUrl: string;
  /**
   * Отклонять ли вебхук оплаты с IP вне списка ЮKassa. По умолчанию false
   * (только лог): главный контроль — авторитетный перезапрос платежа, а строгий
   * IP-фильтр при неверном парсинге X-Forwarded-For мог бы ложно отклонить
   * реальное уведомление и «подвесить» оплату. Включается после проверки логов.
   */
  private readonly verifyWebhookIp: boolean;
  /** Конфиг чека 54-ФЗ (шаг 3); null — фискализация не включена (чек не шлём). */
  private readonly receiptConfig: ReceiptConfig | null;
  /** Часовой пояс отложенного чека (1..11 = UTC+2..+12); НСК = 6 (шаг 4). */
  private readonly receiptTimezone: number;
  private sweeper?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly promocodes: PromocodesService,
    private readonly strapi: StrapiService,
    private readonly telegram: TelegramService,
    private readonly payment: PaymentService,
    config: ConfigService,
  ) {
    this.paymentTtlMin = Number(
      config.get('ORDER_PAYMENT_TTL_MINUTES') ?? 30,
    );
    this.safetyBuffer = Number(
      config.get('EVOTOR_STOCK_SAFETY_BUFFER') ?? 1,
    );
    this.siteUrl = (
      config.get<string>('PUBLIC_SITE_URL', '') || ''
    ).replace(/\/+$/, '');
    this.verifyWebhookIp =
      (config.get<string>('YOOKASSA_WEBHOOK_VERIFY_IP', '') || '') === 'true';
    this.receiptConfig =
      (config.get<string>('YOOKASSA_RECEIPT_ENABLED', '') || '') === 'true'
        ? {
            vatCode: config.get<number>('YOOKASSA_VAT_CODE') ?? 1,
            paymentMode:
              config.get<string>('YOOKASSA_PAYMENT_MODE', '') || 'full_payment',
            measure:
              config.get<string>('YOOKASSA_RECEIPT_MEASURE', '') || undefined,
            taxSystemCode: config.get<number>('YOOKASSA_TAX_SYSTEM_CODE'),
          }
        : null;
    this.receiptTimezone = Number(
      config.get('YOOKASSA_RECEIPT_TIMEZONE') ?? 6, // Новосибирск = UTC+7
    );
    // Страховка конфигурации №2 (находка финального ревью экрана сборки):
    // идемпотентность фискализации маркированного заказа держится на том, что
    // чек ЗАЧЁТА отличим от чека ПРЕДОПЛАТЫ по payment_mode. Если payment_mode
    // в env выставить предоплатным — чек зачёта станет неотличим, и повтор
    // после потерянного ответа выбьет ВТОРОЙ чек (двойное выбытие в ЧЗ).
    // Дефолт full_payment корректен; кричим, если кто-то сменил на предоплату.
    const PREPAY_MODES = ['full_prepayment', 'partial_prepayment', 'advance'];
    if (
      this.receiptConfig &&
      PREPAY_MODES.includes(this.receiptConfig.paymentMode)
    ) {
      this.log.error(
        `YOOKASSA_PAYMENT_MODE=${this.receiptConfig.paymentMode} — предоплатный режим ломает идемпотентность фискализации маркированного (риск двойного чека). Верните full_payment.`,
      );
      void this.telegram
        .alert(
          'Опасная конфигурация чека',
          `YOOKASSA_PAYMENT_MODE=${this.receiptConfig.paymentMode} — риск двойной фискализации маркированного. Нужен full_payment.`,
        )
        .catch(() => undefined);
    }
    // Страховка конфигурации (находка финального аудита): на магазине ЮKassa
    // включены «Чеки от ЮKassa» (режим «Принимать платёж»), и платёж БЕЗ чека
    // там отклоняется «Receipt is missing or illegal». Если эквайринг включён,
    // а чеки в env выключены/опечатаны — упадут ВСЕ онлайн-оплаты. Кричим при
    // старте, чтобы это не искали по жалобам покупателей.
    if (this.payment.enabled && !this.receiptConfig) {
      this.log.error(
        'YOOKASSA_SHOP_ID задан, а YOOKASSA_RECEIPT_ENABLED ≠ true: платежи будут уходить БЕЗ чека, и ЮKassa отклонит их (фискализация на магазине включена). Проверьте .env!',
      );
      void this.telegram
        .alert(
          'Опасная конфигурация оплаты',
          'Эквайринг ЮKassa включён, а чеки (YOOKASSA_RECEIPT_ENABLED) — нет: онлайн-оплаты будут отклоняться. Проверьте .env.',
        )
        .catch(() => undefined);
    }
  }

  // ---------- создание заказа (ТЗ 8.2) ----------

  async create(
    dto: CreateOrderDto,
    source: 'web' | 'max',
    idempotencyKey?: string,
  ): Promise<OrderResponse> {
    // 0. идемпотентность по ключу запроса (ТЗ р.9) — захват ключа ДО
    //    транзакции заказа (заглушка responseBody=null), иначе два строго
    //    параллельных одинаковых POST создают два заказа с двумя резервами.
    const requestHash = createHash('sha256')
      .update(JSON.stringify(dto))
      .digest('hex');
    if (idempotencyKey) {
      const claimed = await this.db
        .insert(idempotencyKeys)
        .values({ key: idempotencyKey, requestHash })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });
      if (!claimed.length) {
        const [existing] = await this.db
          .select()
          .from(idempotencyKeys)
          .where(eq(idempotencyKeys.key, idempotencyKey));
        switch (
          idempotencyDecision(existing, requestHash, Date.now(), IDEM_STALE_MS)
        ) {
          case 'conflict':
            throw new ConflictException({
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'Этот Idempotency-Key уже использован с другим запросом',
            });
          case 'replay':
            return existing!.responseBody as unknown as OrderResponse;
          case 'in_progress':
            throw new ConflictException({
              code: 'IDEMPOTENCY_IN_PROGRESS',
              message:
                'Запрос с этим Idempotency-Key ещё обрабатывается — повторите чуть позже',
            });
          case 'reclaim': {
            // Владелец заглушки упал до записи ответа. Перезахват атомарный:
            // WHERE response_body IS NULL — двум reclaim'ам не выиграть вместе.
            const re = await this.db
              .update(idempotencyKeys)
              .set({ requestHash, createdAt: sql`now()` })
              .where(
                and(
                  eq(idempotencyKeys.key, idempotencyKey),
                  sql`${idempotencyKeys.responseBody} is null`,
                ),
              )
              .returning({ key: idempotencyKeys.key });
            if (!re.length) {
              throw new ConflictException({
                code: 'IDEMPOTENCY_IN_PROGRESS',
                message:
                  'Запрос с этим Idempotency-Key ещё обрабатывается — повторите чуть позже',
              });
            }
            break; // перезахватили — работаем как владелец
          }
          case 'owner':
            break; // строка исчезла между insert и select — работаем
        }
      }
    }

    try {
      return await this.createAfterClaim(dto, source, idempotencyKey);
    } catch (err) {
      // Ошибка ПОСЛЕ захвата ключа: освободить заглушку (только пустую —
      // готовый ответ не трогаем), иначе повтор клиента с исправленным телом
      // упрётся в ложный IDEMPOTENCY_CONFLICT на брошенном ключе.
      if (idempotencyKey) {
        await this.db
          .delete(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.key, idempotencyKey),
              sql`${idempotencyKeys.responseBody} is null`,
            ),
          )
          .catch(() => undefined); // освобождение не должно маскировать исходную ошибку
      }
      throw err;
    }
  }

  /** Создание заказа после захвата Idempotency-Key (см. create). */
  private async createAfterClaim(
    dto: CreateOrderDto,
    source: 'web' | 'max',
    idempotencyKey?: string,
  ): Promise<OrderResponse> {
    // 1. бизнес-правила чекаута (ТЗ 6.7)
    const isPickup = dto.deliveryMethod.startsWith('pickup_');
    if (!isPickup && dto.paymentMethod !== 'online') {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_NOT_ALLOWED',
        message: 'Оплата при получении доступна только для самовывоза',
      });
    }
    if (
      (dto.deliveryMethod === 'courier_nsk' ||
        dto.deliveryMethod === 'russia') &&
      !dto.deliveryAddress?.trim()
    ) {
      throw new BadRequestException({
        code: 'ADDRESS_REQUIRED',
        message: 'Для доставки укажите адрес',
      });
    }

    // 2. перевалидация состава по актуальному каталогу.
    // Дубли одного slug сливаем ДО проверок: иначе каждая строка сверялась бы
    // с остатком независимо (резервы заказа пишутся после цикла) и
    // [{x,5},{x,5}] при 5 доступных проходил бы — оверселл (находка ревью).
    const mergedItems = mergeDuplicateItems(dto.items);
    const internal = await this.catalog.internalBySlug();
    const problems: ItemProblem[] = [];
    const lines: Array<{
      p: ProductInternal;
      quantity: number;
    }> = [];
    for (const item of mergedItems) {
      const p = internal.get(item.id);
      if (!p) {
        problems.push({ id: item.id, reason: 'unknown_item' });
        continue;
      }
      if (item.priceRub !== undefined && item.priceRub !== p.priceRub) {
        problems.push({
          id: item.id,
          reason: 'price_changed',
          actualPriceRub: p.priceRub,
        });
        continue;
      }
      lines.push({ p, quantity: item.quantity });
    }
    if (problems.length) {
      throw new BadRequestException({
        code: 'ORDER_VALIDATION',
        message: 'Некоторые позиции корзины изменились',
        details: problems,
      });
    }

    // 3. промокод (та же серверная валидация, что /promo/validate)
    let discountRub = 0;
    let promoCode: string | null = null;
    // Категория, на которую действует скидка (null — на весь заказ). Нужна для
    // чека: скидку распределяем только по подпадающим строкам.
    let promoCategorySlug: string | null = null;
    if (dto.promoCode?.trim()) {
      const promo = await this.promocodes.validate(dto.promoCode, mergedItems);
      if (!promo.valid) {
        throw new BadRequestException({
          code: 'PROMO_INVALID',
          message: promo.message,
          details: [{ reason: promo.reason }],
        });
      }
      discountRub = promo.discountRub;
      promoCode = promo.code;
      promoCategorySlug = promo.categorySlug ?? null;
    }

    const subtotalRub = lines.reduce(
      (s, l) => s + l.p.priceRub * l.quantity,
      0,
    );

    // 4. доставка по тарифам из админки (ТЗ р.12)
    const tariffsRaw = await this.strapi.deliveryTariffs();
    const tariffs: DeliveryTariffs = {
      courierNskPriceRub: Number(tariffsRaw.courierNskPriceRub ?? 0),
      freeDeliveryThresholdRub:
        tariffsRaw.freeDeliveryThresholdRub == null
          ? null
          : Number(tariffsRaw.freeDeliveryThresholdRub),
      russiaWeightTiers:
        (tariffsRaw.russiaWeightTiers as DeliveryTariffs['russiaWeightTiers']) ??
        [],
    };
    let deliveryRub: number;
    try {
      deliveryRub = calcDelivery(
        dto.deliveryMethod,
        lines.map((l) => ({
          quantity: l.quantity,
          unitWeightG: this.catalog.unitWeightG(l.p),
          isPerishable: l.p.isPerishable,
        })),
        tariffs,
        subtotalRub - discountRub,
      );
    } catch (err) {
      if (err instanceof DeliveryNotAvailableError) {
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
    const totalRub = subtotalRub - discountRub + deliveryRub;

    // 5. целевой магазин списания: самовывоз — конкретная точка,
    //    доставка — магазин «основной» записи товара (склад по умолчанию)
    const targetStoreId = await this.resolveTargetStore(dto.deliveryMethod);

    // 6. транзакция: блокировка остатков -> проверка -> заказ+резервы
    const response: OrderResponse = await this.db.transaction(async (tx) => {
      const stockProblems: ItemProblem[] = [];
      const reservations: Array<{
        storeId: string;
        evotorUuid: string;
        qty: number; // в единицах товара (кг для весовых)
      }> = [];

      for (const { p, quantity } of lines) {
        // запись товара в целевом магазине ищем по match_key
        const rows = await tx.execute(sql`
          SELECT store_id, evotor_uuid, quantity, measure
          FROM evotor_products
          WHERE match_key = ${p.matchKey}
            AND store_id = ${targetStoreId ?? p.storeId}
            AND is_archived = false AND allow_to_sell = true
          FOR UPDATE
        `);
        const row = (rows as unknown as { rows: Array<Record<string, unknown>> })
          .rows[0];
        if (!row) {
          stockProblems.push({
            id: p.slug,
            reason: 'out_of_stock',
            availableQty: 0,
          });
          continue;
        }
        const storeId = String(row.store_id);
        const evotorUuid = String(row.evotor_uuid);
        const physical = Number(row.quantity);
        const [resRow] = (
          (await tx.execute(sql`
            SELECT coalesce(sum(quantity), 0) AS reserved
            FROM stock_reservations
            WHERE store_id = ${storeId} AND evotor_uuid = ${evotorUuid}
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > now())
          `)) as unknown as { rows: Array<{ reserved: string }> }
        ).rows;
        const availableUnits = physical - Number(resRow?.reserved ?? 0);
        const isWeight = String(row.measure) === 'кг';
        const portionKg = safePortionMassG(p.portionMassG) / 1000;
        // Та же математика, что на витрине и в quote (единый источник).
        const availableQty = orderableUnits({
          availableQty: availableUnits,
          measure: String(row.measure),
          portionMassG: p.portionMassG,
          buffer: this.safetyBuffer,
        });
        if (availableQty < quantity) {
          stockProblems.push({
            id: p.slug,
            reason: 'out_of_stock',
            availableQty: Math.max(availableQty, 0),
          });
          continue;
        }
        reservations.push({
          storeId,
          evotorUuid,
          qty: isWeight ? quantity * portionKg : quantity,
        });
      }

      if (stockProblems.length) {
        throw new BadRequestException({
          code: 'ORDER_VALIDATION',
          message: 'Недостаточно остатка по некоторым позициям',
          details: stockProblems,
        });
      }

      const isOnline = dto.paymentMethod === 'online';
      // Оплата нужна только при онлайн-способе И положительном итоге: заказ на
      // 0 ₽ (100%-скидка + самовывоз) ЮKassa не примет — ведём его как обычный
      // (new), без ссылки на оплату и без автоотмены по TTL.
      const needsPayment = isOnline && totalRub > 0;
      // Лимит «Чеков от ЮKassa» — не более 80 позиций в чеке. Маркированные
      // строки разворачиваются по единицам (свой код на каждую), поэтому
      // проверяем ВЕРХНЮЮ оценку будущих позиций ДО создания заказа: для
      // маркированного чек уходит ПОСЛЕ оплаты, и превышение там означало бы
      // «деньги приняты, а фискализация невозможна».
      if (needsPayment && this.receiptConfig) {
        const positions = receiptPositionsUpperBound(
          lines.map((l) => ({
            quantity: l.quantity,
            isMarked: l.p.isMarked,
          })),
          rubToKopecks(deliveryRub),
          discountRub > 0,
        );
        if (positions > RECEIPT_MAX_ITEMS) {
          throw new BadRequestException({
            code: 'RECEIPT_TOO_MANY_POSITIONS',
            message: `В заказе слишком много позиций для одного фискального чека (лимит ${RECEIPT_MAX_ITEMS}). Пожалуйста, разделите заказ на несколько.`,
          });
        }
        // Находка ревью: 100%-промо, покрывающее всю стоимость подпадающих
        // строк, обнуляет их; маркированную строку с нулём в чек собрать
        // нельзя НИКОГДА — а для маркированного заказа (отложенный чек) это
        // вскрылось бы уже ПОСЛЕ оплаты. Отказываем до денег.
        const zeroesMarked = discountZeroesMarkedLine(
          lines.map((l) => ({
            priceKopecks: rubToKopecks(l.p.priceRub),
            quantity: l.quantity,
            discountEligible:
              promoCategorySlug === null ||
              l.p.categorySlug === promoCategorySlug,
            isMarked: l.p.isMarked,
          })),
          rubToKopecks(discountRub),
        );
        if (zeroesMarked) {
          throw new BadRequestException({
            code: 'PROMO_ZEROES_MARKED_LINE',
            message:
              'Промокод обнуляет стоимость маркированного товара — фискальный чек с таким составом собрать нельзя. Уберите промокод или маркированный товар из корзины.',
          });
        }
      }
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: 'PENDING',
          status: needsPayment ? 'awaiting_payment' : 'new',
          customerName: dto.name.trim(),
          customerPhone: normalizePhone(dto.phone),
          customerEmail: dto.email?.trim() || null,
          deliveryMethod: dto.deliveryMethod,
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          deliveryCostKopecks: rubToKopecks(deliveryRub),
          paymentMethod: dto.paymentMethod,
          promoCode,
          promoDiscountKopecks: rubToKopecks(discountRub),
          itemsSubtotalKopecks: rubToKopecks(subtotalRub),
          totalKopecks: rubToKopecks(totalRub),
          source,
          comment: dto.comment?.trim() || null,
        })
        .returning({ id: orders.id, accessToken: orders.accessToken });

      const orderNumber = `ALT-${String(order.id).padStart(6, '0')}`;
      await tx
        .update(orders)
        .set({ orderNumber })
        .where(eq(orders.id, order.id));

      await tx.insert(orderItems).values(
        lines.map(({ p, quantity }) => ({
          orderId: order.id,
          storeId: reservations.find((r) => r.evotorUuid)?.storeId ?? p.storeId,
          evotorUuid: p.evotorUuid,
          name: p.name,
          priceKopecks: rubToKopecks(p.priceRub),
          quantity,
          portionMassG:
            p.measure === 'кг' ? safePortionMassG(p.portionMassG) : null,
          unit:
            p.measure === 'кг'
              ? `порция ${safePortionMassG(p.portionMassG)} г`
              : 'шт',
          isMarked: p.isMarked,
          // Снапшот eligibility скидки: категорийный промокод действует только
          // на свою категорию — отложенный чек (шаг 4) строится по этому полю.
          discountEligible:
            promoCategorySlug === null ||
            p.categorySlug === promoCategorySlug,
          sumKopecks: p.priceRub * quantity * 100,
        })),
      );

      const expiresAt = needsPayment
        ? new Date(Date.now() + this.paymentTtlMin * 60_000)
        : null;
      await tx.insert(stockReservations).values(
        reservations.map((r) => ({
          orderId: order.id,
          storeId: r.storeId,
          evotorUuid: r.evotorUuid,
          quantity: String(r.qty),
          status: 'active' as const,
          expiresAt,
        })),
      );

      if (promoCode) {
        await tx.insert(promocodeUsages).values({
          code: promoCode,
          orderId: order.id,
          discountKopecks: rubToKopecks(discountRub),
        });
      }

      return {
        id: order.id,
        orderNumber,
        accessToken: order.accessToken,
        status: needsPayment ? 'awaiting_payment' : 'new',
        totals: { subtotalRub, discountRub, deliveryRub, totalRub },
        paymentUrl: null,
      } satisfies OrderResponse;
    });

    // Онлайн-оплата (Этап 3, шаг 1): создаём платёж в ЮKassa ВНЕ транзакции
    // заказа (сетевой вызов не держит БД-транзакцию). Сумма — из нашей БД
    // (totalRub), не из клиента: подделать нельзя. Эквайер не настроен → заказ
    // без paymentUrl (не падаем). Сбой настроенного эквайера пробрасывается:
    // покупатель повторит, а неоплаченный заказ снимет автоотмена. paymentUrl
    // пишем в response ДО сохранения идемпотентности — чтобы повтор вернул ту
    // же ссылку.
    if (response.status === 'awaiting_payment' && this.payment.enabled) {
      const payment = await this.payment.createPayment({
        orderId: response.id,
        orderNumber: response.orderNumber,
        amountKopecks: rubToKopecks(response.totals.totalRub),
        returnUrl: `${this.siteUrl}/order/${response.id}?token=${response.accessToken}`,
        customerEmail: dto.email?.trim() || null,
        receipt: this.buildOrderReceipt(
          lines,
          discountRub,
          deliveryRub,
          totalRub,
          dto,
          promoCategorySlug,
        ),
      });
      if (payment) {
        response.paymentUrl = payment.confirmationUrl;
        await this.db
          .update(orders)
          .set({ paymentExternalId: payment.paymentId })
          .where(eq(orders.id, response.id));
      }
    }

    if (idempotencyKey) {
      // Ключ захвачен заглушкой в create() ДО транзакции — дописываем ответ.
      await this.db
        .update(idempotencyKeys)
        .set({ responseStatus: 201, responseBody: response })
        .where(eq(idempotencyKeys.key, idempotencyKey));
    }

    await this.catalog.invalidate(); // резерв виден в каталоге сразу
    this.log.log(`заказ ${response.orderNumber} создан (${source})`);
    // уведомление магазину (fire-and-forget; свои ошибки не пробрасывает)
    void this.telegram.notifyNewOrder({
      id: response.id,
      orderNumber: response.orderNumber,
      customerName: dto.name.trim(),
      customerPhone: normalizePhone(dto.phone),
      deliveryMethod: dto.deliveryMethod,
      deliveryAddress: dto.deliveryAddress?.trim() || null,
      items: lines.map((l) => ({ name: l.p.name, quantity: l.quantity })),
      totalRub: response.totals.totalRub,
      source,
    });
    return response;
  }

  // ---------- предрасчёт доставки для сводки чекаута (ТЗ 6.7) ----------

  async quoteDelivery(dto: {
    deliveryMethod: DeliveryMethod;
    items: Array<{ id: string; quantity: number }>;
    promoCode?: string;
  }) {
    const internal = await this.catalog.internalBySlug();
    const unknown = dto.items.filter((i) => !internal.get(i.id));
    if (unknown.length) {
      throw new BadRequestException({
        code: 'ORDER_VALIDATION',
        message: 'Неизвестные позиции корзины',
        details: unknown.map((i) => ({ id: i.id, reason: 'unknown_item' })),
      });
    }
    const lines = dto.items.map((i) => ({
      p: internal.get(i.id) as ProductInternal,
      quantity: i.quantity,
    }));
    const subtotalRub = lines.reduce(
      (s, l) => s + l.p.priceRub * l.quantity,
      0,
    );

    let discountRub = 0;
    if (dto.promoCode?.trim()) {
      const promo = await this.promocodes.validate(dto.promoCode, dto.items);
      if (!promo.valid) {
        throw new BadRequestException({
          code: 'PROMO_INVALID',
          message: promo.message,
          details: [{ reason: promo.reason }],
        });
      }
      discountRub = promo.discountRub;
    }

    const tariffsRaw = await this.strapi.deliveryTariffs();
    const tariffs: DeliveryTariffs = {
      courierNskPriceRub: Number(tariffsRaw.courierNskPriceRub ?? 0),
      freeDeliveryThresholdRub:
        tariffsRaw.freeDeliveryThresholdRub == null
          ? null
          : Number(tariffsRaw.freeDeliveryThresholdRub),
      russiaWeightTiers:
        (tariffsRaw.russiaWeightTiers as DeliveryTariffs['russiaWeightTiers']) ??
        [],
    };
    const deliveryLines = lines.map((l) => ({
      quantity: l.quantity,
      unitWeightG: this.catalog.unitWeightG(l.p),
      isPerishable: l.p.isPerishable,
    }));
    // Мягкая предпроверка остатка ЦЕЛЕВОГО магазина (недочёт #5 ТЗ / #37):
    // предупреждаем до создания заказа, авторитетная проверка — в create().
    const stockProblems = await this.quoteStockProblems(
      dto.deliveryMethod,
      lines,
    );
    try {
      const deliveryRub = calcDelivery(
        dto.deliveryMethod,
        deliveryLines,
        tariffs,
        subtotalRub - discountRub,
      );
      return {
        deliveryRub,
        subtotalRub,
        discountRub,
        totalRub: subtotalRub - discountRub + deliveryRub,
        weightG: deliveryLines.reduce(
          (s, l) => s + l.unitWeightG * l.quantity,
          0,
        ),
        freeDeliveryThresholdRub: tariffs.freeDeliveryThresholdRub,
        ...(stockProblems.length ? { stockProblems } : {}),
      };
    } catch (err) {
      if (err instanceof DeliveryNotAvailableError) {
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }

  private async resolveTargetStore(
    method: DeliveryMethod,
  ): Promise<string | null> {
    if (!isPickupPoint(method)) return null; // доставка — магазин записи товара
    const stores = await this.db.select().from(evotorStores);
    const match = resolvePickupStores(stores).find((m) => m.point === method);
    if (!match) {
      throw new BadRequestException({
        code: 'PICKUP_POINT_UNKNOWN',
        message: 'Точка самовывоза не настроена',
      });
    }
    return match.storeId;
  }

  /**
   * Доступно к заказу в конкретном магазине (шт/порции) — та же математика,
   * что в create(), но обычным SELECT без блокировок (для предпроверки quote).
   */
  private async storeOrderable(
    p: ProductInternal,
    storeId: string,
  ): Promise<number> {
    const rows = await this.db.execute(sql`
      SELECT evotor_uuid, quantity, measure
      FROM evotor_products
      WHERE match_key = ${p.matchKey}
        AND store_id = ${storeId}
        AND is_archived = false AND allow_to_sell = true
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> })
      .rows[0];
    if (!row) return 0;
    const [resRow] = (
      (await this.db.execute(sql`
        SELECT coalesce(sum(quantity), 0) AS reserved
        FROM stock_reservations
        WHERE store_id = ${storeId}
          AND evotor_uuid = ${String(row.evotor_uuid)}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
      `)) as unknown as { rows: Array<{ reserved: string }> }
    ).rows;
    return orderableUnits({
      availableQty: Number(row.quantity) - Number(resRow?.reserved ?? 0),
      measure: String(row.measure),
      portionMassG: p.portionMassG,
      buffer: this.safetyBuffer,
    });
  }

  /**
   * Мягкая предпроверка корзины против целевого магазина выбранного способа
   * (недочёт #5 ТЗ): самовывоз — точка, доставка — магазин записи товара.
   * Для самовывоза, если ДРУГАЯ точка покрывает количество — подсказываем её.
   * Не ошибка: фронт показывает предупреждение до создания заказа,
   * авторитетная проверка остаётся в create().
   */
  private async quoteStockProblems(
    method: DeliveryMethod,
    lines: Array<{ p: ProductInternal; quantity: number }>,
  ): Promise<QuoteStockProblem[]> {
    const targetStoreId = await this.resolveTargetStore(method);
    const pickupStores = isPickupPoint(method)
      ? resolvePickupStores(await this.db.select().from(evotorStores))
      : [];
    const problems: QuoteStockProblem[] = [];
    for (const { p, quantity } of lines) {
      const availableQty = await this.storeOrderable(
        p,
        targetStoreId ?? p.storeId,
      );
      if (availableQty >= quantity) continue;
      const problem: QuoteStockProblem = { id: p.slug, availableQty };
      if (isPickupPoint(method)) {
        const other = otherPickupPoint(method, pickupStores);
        if (other) {
          const otherQty = await this.storeOrderable(p, other.storeId);
          if (otherQty >= quantity) {
            problem.otherPickup = {
              point: other.point,
              availableQty: otherQty,
            };
          }
        }
      }
      problems.push(problem);
    }
    return problems;
  }

  // ---------- публичный статус (ТЗ р.9) ----------

  async publicStatus(id: number, token: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    // токен обязателен; несовпадение не раскрывает существование заказа
    if (!order || order.accessToken !== token) {
      throw new NotFoundException('Заказ не найден');
    }
    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      deliveryMethod: order.deliveryMethod,
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod,
      totals: {
        subtotalRub: order.itemsSubtotalKopecks / 100,
        discountRub: order.promoDiscountKopecks / 100,
        deliveryRub: order.deliveryCostKopecks / 100,
        totalRub: order.totalKopecks / 100,
      },
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        priceRub: i.priceKopecks / 100,
        sumRub: i.sumKopecks / 100,
      })),
      instruction: this.instructionFor(order.deliveryMethod, order.status),
    };
  }

  private instructionFor(method: string, status: string): string {
    if (status === 'cancelled') return 'Заказ отменён.';
    if (method === 'pickup_leningradskaya') {
      return 'Заберите заказ: г. Новосибирск, ул. Ленинградская 75/2. Покажите номер заказа на кассе.';
    }
    if (method === 'pickup_titova') {
      return 'Заберите заказ: г. Новосибирск, ул. Титова 32. Покажите номер заказа на кассе.';
    }
    if (method === 'courier_nsk') {
      return 'Курьер свяжется с вами по телефону в день доставки.';
    }
    return 'Отправим СДЭК/Почтой России, срок 3–10 дней. Трек-номер сообщим по телефону.';
  }

  // ---------- админ: список / карточка / смена статуса (Вариант A) ----------

  /** Список заказов для владельца: сводка + фильтр по статусу + пагинация. */
  async listOrders(opts: {
    status?: OrderStatus;
    /** Фильтр точки/способа: кассир видит заказы СВОЕЙ точки (шаг 5). */
    deliveryMethod?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conds = [
      opts.status ? eq(orders.status, opts.status) : undefined,
      opts.deliveryMethod
        ? eq(
            orders.deliveryMethod,
            opts.deliveryMethod as typeof orders.deliveryMethod.enumValues[number],
          )
        : undefined,
    ].filter((c) => c !== undefined);
    const cond = conds.length ? and(...conds) : undefined;
    const rows = await this.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        deliveryMethod: orders.deliveryMethod,
        totalKopecks: orders.totalKopecks,
        source: orders.source,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(cond)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(cond);
    // Число позиций — отдельным сгруппированным запросом по id страницы
    // (коррелированный подзапрос в select через drizzle-шаблон не коррелирует).
    const ids = rows.map((r) => r.id);
    const counts = ids.length
      ? await this.db
          .select({
            orderId: orderItems.orderId,
            n: sql<number>`count(*)::int`,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, ids))
          .groupBy(orderItems.orderId)
      : [];
    const countByOrder = new Map(counts.map((c) => [c.orderId, c.n]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        status: r.status,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        deliveryMethod: r.deliveryMethod,
        totalRub: r.totalKopecks / 100,
        itemsCount: countByOrder.get(r.id) ?? 0,
        source: r.source,
        createdAt: r.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }

  /** Карточка заказа для владельца: состав + контакт (пробить/связаться). */
  async adminOrder(id: number) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    if (!order) throw new NotFoundException('Заказ не найден');
    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt,
      customer: {
        name: order.customerName,
        phone: order.customerPhone,
        email: order.customerEmail,
      },
      deliveryMethod: order.deliveryMethod,
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod,
      source: order.source,
      comment: order.comment,
      cancelReason: order.cancelReason,
      promoCode: order.promoCode,
      totals: {
        subtotalRub: order.itemsSubtotalKopecks / 100,
        discountRub: order.promoDiscountKopecks / 100,
        deliveryRub: order.deliveryCostKopecks / 100,
        totalRub: order.totalKopecks / 100,
      },
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        evotorUuid: i.evotorUuid,
        storeId: i.storeId,
        isMarked: i.isMarked,
        // Экран сборки (шаг 4): сколько кодов уже отсканировано.
        markCodes: i.markCodes ?? [],
        priceRub: i.priceKopecks / 100,
        sumRub: i.sumKopecks / 100,
      })),
      // Отложенная фискализация (шаг 4): id чека ЮKassa, null — ещё не выбит.
      // Маркер захвата 'pending:' наружу не отдаём — это НЕ чек (крэш между
      // захватом и записью не должен выглядеть как «фискализировано»).
      fiscalReceiptId: order.fiscalReceiptId?.startsWith('pending:')
        ? null
        : order.fiscalReceiptId,
      fiscalizationInProgress:
        order.fiscalReceiptId?.startsWith('pending:') ?? false,
      // Флаг «нужно фискализировать» — только для РЕАЛЬНО оплаченных онлайн
      // маркированных заказов при включённой фискализации (иначе кнопка
      // горела бы на неоплаченных/отменённых/бесплатных вечно). Маркер захвата
      // считается отсутствием чека: кнопка видна, брошенный захват перехватится.
      fiscalizationRequired:
        this.receiptConfig !== null &&
        order.paymentMethod === 'online' &&
        order.paymentExternalId !== null &&
        !['new', 'awaiting_payment', 'cancelled'].includes(order.status) &&
        items.some((i) => i.isMarked) &&
        (!order.fiscalReceiptId ||
          order.fiscalReceiptId.startsWith('pending:')),
    };
  }

  // ---------- маркировка: коды при сборке + отложенный чек (шаг 4) ----------

  /**
   * Сохранить отсканированные коды Data Matrix строки заказа (экран сборки).
   * Кодов может быть меньше quantity (сканируют по одному) — полноту требует
   * fiscalizeOrder. После фискализации коды заморожены.
   */
  async saveMarkCodes(
    orderId: number,
    itemId: number,
    codesRaw: string[],
  ): Promise<{ itemId: number; saved: number; required: number }> {
    const codes = codesRaw.map((c) => c.trim()).filter(Boolean);
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Один и тот же код отсканирован дважды');
    }
    // Всё в одной транзакции под FOR UPDATE строки заказа: сериализуемся и с
    // захватом фискализации (claim-UPDATE ждёт блокировку → прочитает коды уже
    // после нашего коммита), и с параллельным saveMarkCodes (дедуп кодов между
    // позициями не обходится гонкой).
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .select({ fiscalReceiptId: orders.fiscalReceiptId })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update');
      if (!order) throw new NotFoundException('Заказ не найден');
      if (order.fiscalReceiptId) {
        throw new ConflictException(
          order.fiscalReceiptId.startsWith('pending:')
            ? 'Идёт фискализация — коды заморожены, попробуйте позже'
            : 'Заказ уже фискализирован — коды заморожены',
        );
      }
      const items = await tx
        .select({
          id: orderItems.id,
          isMarked: orderItems.isMarked,
          quantity: orderItems.quantity,
          markCodes: orderItems.markCodes,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      const item = items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException('Позиция заказа не найдена');
      if (!item.isMarked) {
        throw new BadRequestException('Позиция не маркированная — коды не нужны');
      }
      if (codes.length > item.quantity) {
        throw new BadRequestException(
          `Кодов ${codes.length}, а единиц ${item.quantity} — лишний код`,
        );
      }
      // Один Data Matrix — одна физическая единица: код не может повториться и
      // в ДРУГОЙ позиции заказа (кассир отсканировал ту же бутылку дважды).
      const elsewhere = new Set(
        items.filter((i) => i.id !== itemId).flatMap((i) => i.markCodes ?? []),
      );
      const clash = codes.find((c) => elsewhere.has(c));
      if (clash) {
        throw new BadRequestException(
          `Код уже отсканирован в другой позиции заказа: ${clash.slice(0, 40)}…`,
        );
      }
      await tx
        .update(orderItems)
        .set({ markCodes: codes })
        .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
      this.log.log(
        `заказ #${orderId}, позиция #${itemId}: кодов маркировки ${codes.length}/${item.quantity}`,
      );
      return { itemId, saved: codes.length, required: item.quantity };
    });
  }

  /**
   * Отложенная фискализация маркированного заказа (шаг 4): после сборки, когда
   * все коды отсканированы, шлём чек POST /receipts (settlement cashless по
   * принятой онлайн-оплате). Полноту кодов проверяет сборка чека — без полного
   * набора фискализация невозможна (ТЗ р.11). Повторная фискализация
   * идемпотентна (fiscalReceiptId + Idempotence-Key ЮKassa).
   */
  async fiscalizeOrder(
    orderId: number,
  ): Promise<{ receiptId: string; status: string; already?: boolean }> {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!order) throw new NotFoundException('Заказ не найден');
    if (!this.receiptConfig) {
      throw new BadRequestException(
        'Фискализация не настроена (YOOKASSA_RECEIPT_ENABLED)',
      );
    }
    // Уже есть отметка о чеке: различаем маркер захвата и реальный id.
    if (order.fiscalReceiptId) {
      const handled = await this.resolveExistingReceipt(
        orderId,
        order.fiscalReceiptId,
      );
      if (handled) return handled; // реальный «живой» чек — идемпотентный ответ
      // чек отменён кассой/ОФД или захват брошен — продолжаем новую отправку
    }
    if (order.paymentMethod !== 'online' || !order.paymentExternalId) {
      throw new BadRequestException(
        'Отложенный чек — только для онлайн-оплаченных заказов (офлайн бьёт касса)',
      );
    }
    if (
      order.status === 'new' ||
      order.status === 'awaiting_payment' ||
      order.status === 'cancelled'
    ) {
      throw new ConflictException(
        `Заказ в статусе «${order.status}» — фискализировать нельзя (не оплачен)`,
      );
    }
    // АТОМАРНЫЙ захват фискализации: маркер pending вместо NULL (или вместо
    // брошенного маркера/сброшенного canceled-чека). Проигравший параллельный
    // вызов получает 0 строк → 409. Guard по статусу отсекает гонку с отменой.
    const claim = `pending:${new Date().toISOString()}`;
    const prev = order.fiscalReceiptId;
    const claimed = await this.db
      .update(orders)
      .set({ fiscalReceiptId: claim, updatedAt: sql`now()` })
      .where(
        and(
          eq(orders.id, orderId),
          prev === null
            ? isNull(orders.fiscalReceiptId)
            : eq(orders.fiscalReceiptId, prev),
          sql`${orders.status} not in ('new', 'awaiting_payment', 'cancelled')`,
        ),
      )
      .returning({ id: orders.id });
    if (!claimed.length) {
      throw new ConflictException(
        'Фискализация уже выполняется параллельно (или заказ изменён) — обновите страницу',
      );
    }
    const release = () =>
      this.db
        .update(orders)
        .set({ fiscalReceiptId: null, updatedAt: sql`now()` })
        .where(and(eq(orders.id, orderId), eq(orders.fiscalReceiptId, claim)))
        .then(() => undefined)
        .catch(() => undefined);
    try {
      // Позиции читаем ПОСЛЕ захвата, ДЕТЕРМИНИРОВАННО (orderBy): от порядка
      // строк зависит хеш тела чека — ключ идемпотентности ЮKassa.
      const items = await this.db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .orderBy(orderItems.id);
      // Защита от задвоения: чек мог быть выбит ПРИ ОПЛАТЕ (немаркированный
      // заказ) или прошлой попыткой, ответ которой потерян. Сверяемся с ЮKassa
      // по payment_id (findReceiptByPayment отдаёт только живой чек прихода).
      const existing = await this.payment.findReceiptByPayment(
        order.paymentExternalId,
      );
      if (existing) {
        await this.db
          .update(orders)
          .set({ fiscalReceiptId: existing.receiptId, updatedAt: sql`now()` })
          .where(and(eq(orders.id, orderId), eq(orders.fiscalReceiptId, claim)));
        this.log.warn(
          `заказ #${orderId}: найден уже выбитый чек ${existing.receiptId} — повторную отправку не делаем`,
        );
        // Коды могли меняться между попытками — чек в ЮKassa мог уйти с их
        // прошлой версией. Требует ручной сверки, молчать нельзя.
        await this.telegram
          .alert(
            `Заказ #${orderId}: найден уже выбитый чек`,
            `Чек ${existing.receiptId} существовал до этой попытки (потерянный ответ?). Сверьте коды маркировки в чеке с фактическими.`,
          )
          .catch(() => undefined);
        return { ...existing, already: true };
      }
      // Живого чека нет. Обычно отложенный чек = маркированный заказ (чек при
      // оплате пропущен из-за кодов). Немаркированный заказ без чека — это
      // сбой сборки чека при оплате: разрешаем ремонтную фискализацию, но
      // громко помечаем (в норме сюда попадать не должны).
      if (!items.some((i) => i.isMarked)) {
        this.log.warn(
          `заказ #${orderId}: немаркированный, но чека при оплате нет — ремонтная фискализация`,
        );
        await this.telegram
          .alert(
            `Заказ #${orderId}: ремонтная фискализация`,
            'Немаркированный онлайн-заказ оказался без чека при оплате — выбиваем отложенный. Проверьте, почему чек не ушёл с платежом.',
          )
          .catch(() => undefined);
      }
      // Сборка чека бросит понятную ошибку (нет кодов/нулевая маркированная
      // строка/сумма разошлась) — кассиру отдаём 400, он исправит и повторит.
      let receiptBody;
      try {
        receiptBody = buildPostPaymentReceipt({
          lines: items.map((i) => ({
            description: i.name,
            priceKopecks: i.priceKopecks,
            quantity: i.quantity,
            discountEligible: i.discountEligible,
            isMarked: i.isMarked,
            markCodes: i.markCodes,
          })),
          discountKopecks: order.promoDiscountKopecks,
          deliveryKopecks: order.deliveryCostKopecks,
          totalKopecks: order.totalKopecks,
          customer: {
            email: order.customerEmail,
            phone: order.customerPhone,
          },
          config: this.receiptConfig,
          paymentId: order.paymentExternalId,
          timezone: this.receiptTimezone,
          // Маркированный заказ: при оплате ушёл чек ПРЕДОПЛАТЫ (без кодов),
          // этот чек — ЗАЧЁТ предоплаты с кодами при передаче товара
          // (54-ФЗ; подтверждено песочницей 20.07). Ремонтный чек
          // немаркированного — обычный безнал.
          settlementType: items.some((i) => i.isMarked)
            ? 'prepayment'
            : 'cashless',
        });
      } catch (err) {
        await release();
        throw new BadRequestException((err as Error).message);
      }
      // Соль = маркер захвата: повтор в рамках одного захвата дедуплицируется,
      // новая попытка (после отклонённого чека) уходит новым ключом.
      const created = await this.payment.createReceipt(orderId, receiptBody, claim);
      if (!created) {
        await release();
        throw new BadRequestException('ЮKassa не настроена — чек не отправлен');
      }
      await this.db
        .update(orders)
        .set({ fiscalReceiptId: created.receiptId, updatedAt: sql`now()` })
        .where(and(eq(orders.id, orderId), eq(orders.fiscalReceiptId, claim)));
      this.log.log(
        `заказ #${orderId}: отложенный чек ${created.receiptId} (${created.status})`,
      );
      return created;
    } catch (err) {
      // ЛЮБАЯ ошибка снимает захват, чтобы кассир мог повторить (иначе заказ
      // «заморожен» на 5 минут stale-порога). Повторный release безопасен
      // (guard по claim), потерянный ответ страхует findReceiptByPayment.
      await release();
      throw err;
    }
  }

  /**
   * Обработка существующей отметки fiscalReceiptId перед новой фискализацией:
   *  - маркер захвата свежий → параллельная фискализация, 409;
   *  - маркер старше 5 минут → процесс упал, захват считается брошенным (null);
   *  - реальный чек: перезапрашиваем статус у ЮKassa — canceled (касса/ОФД
   *    отклонили) → сбрасываем отметку, размораживая коды, и даём повторить;
   *    иначе идемпотентный ответ с РЕАЛЬНЫМ статусом (не захардкоженным).
   */
  private async resolveExistingReceipt(
    orderId: number,
    fiscalReceiptId: string,
  ): Promise<{ receiptId: string; status: string; already: true } | null> {
    if (fiscalReceiptId.startsWith('pending:')) {
      const startedAt = Date.parse(fiscalReceiptId.slice('pending:'.length));
      if (Number.isFinite(startedAt) && Date.now() - startedAt < 5 * 60_000) {
        throw new ConflictException(
          'Фискализация уже выполняется — подождите и обновите страницу',
        );
      }
      return null; // брошенный захват: перехватим (guard eq(prev) в claim)
    }
    const actual = await this.payment.getReceipt(fiscalReceiptId);
    if (actual && actual.status === 'canceled') {
      // Долговечный след ДО сброса: id отклонённого чека остаётся в логах
      // (хранятся 90 дней) даже при недоступном Telegram.
      this.log.error(
        `заказ #${orderId}: чек ${fiscalReceiptId} отклонён кассой/ОФД (canceled) — сбрасываем, разрешаем повтор`,
      );
      await this.db
        .update(orders)
        .set({ fiscalReceiptId: null, updatedAt: sql`now()` })
        .where(
          and(eq(orders.id, orderId), eq(orders.fiscalReceiptId, fiscalReceiptId)),
        );
      await this.telegram
        .alert(
          `Чек заказа #${orderId} отклонён кассой/ОФД`,
          `Чек ${fiscalReceiptId} завершился canceled. Коды разморожены — проверьте и фискализируйте заново.`,
        )
        .catch(() => undefined);
      throw new ConflictException(
        'Предыдущий чек отклонён кассой/ОФД — проверьте коды и повторите фискализацию',
      );
    }
    if (!actual && this.payment.enabled) {
      // Чек числится в заказе, но в ЮKassa не найден (смена магазина/ключей?) —
      // ручной разбор; не блокируем молча с фейковым already.
      this.log.error(
        `заказ #${orderId}: чек ${fiscalReceiptId} не найден в ЮKassa — ручной разбор`,
      );
      await this.telegram
        .alert(
          `Чек заказа #${orderId} не найден в ЮKassa`,
          `В заказе записан чек ${fiscalReceiptId}, но ЮKassa его не знает. Проверьте магазин/ключи.`,
        )
        .catch(() => undefined);
      return { receiptId: fiscalReceiptId, status: 'not_found', already: true };
    }
    return {
      receiptId: fiscalReceiptId,
      status: actual?.status ?? 'unknown',
      already: true,
    };
  }

  /**
   * Смена статуса заказа владельцем. Освобождение резерва привязано к
   * жизненному циклу заказа (Вариант A), а не к чеку:
   *  - cancelled → резервы released (товар вернулся в доступные);
   *  - completed/shipped → резервы committed (товар ушёл; физический
   *    остаток уже снизил чек с кассы — двойного вычета нет).
   * Пока заказ не закрыт, резерв держится → сайт показывает чуть меньше,
   * чем есть (безопасно, не перепродаст). cancelled/completed — терминальные.
   */
  async setStatus(
    id: number,
    status: OrderStatus,
    reason?: string,
  ): Promise<{ id: number; status: OrderStatus }> {
    const [cur] = await this.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, id));
    if (!cur) throw new NotFoundException('Заказ не найден');
    if (status === cur.status) return { id, status };
    // Граф переходов (ТЗ 8.2): скачки через этапы и отмена после начала
    // сборки запрещены — товар уже снят с полки (см. order-status.ts).
    if (!canTransition(cur.status, status)) {
      throw new ConflictException({
        code: 'ORDER_TRANSITION_FORBIDDEN',
        message: `Переход «${cur.status}» → «${status}» недопустим`,
      });
    }
    // Гейт 54-ФЗ/«Честный знак» (находка финального аудита): маркированный
    // онлайн-оплаченный заказ нельзя объявить готовым к выдаче/переданным в
    // доставку, пока не выбит чек ЗАЧЁТА с кодами — иначе товар уйдёт
    // покупателю без фискализации передачи. Офлайн-оплату и немаркированные
    // не трогаем (см. blocksHandoffWithoutOffsetReceipt).
    if (status === 'ready_for_pickup' || status === 'shipped') {
      const [o] = await this.db
        .select({
          paymentExternalId: orders.paymentExternalId,
          fiscalReceiptId: orders.fiscalReceiptId,
        })
        .from(orders)
        .where(eq(orders.id, id));
      const [markedRow] = await this.db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(
          and(eq(orderItems.orderId, id), eq(orderItems.isMarked, true)),
        )
        .limit(1);
      // «pending:<маркер>» — захват фискализации, чека ещё нет.
      const fiscalized =
        !!o?.fiscalReceiptId && !o.fiscalReceiptId.startsWith('pending:');
      if (
        blocksHandoffWithoutOffsetReceipt(status, {
          hasMarkedItems: !!markedRow,
          isOnlinePaid: !!o?.paymentExternalId,
          fiscalized,
        })
      ) {
        throw new ConflictException({
          code: 'ORDER_NOT_FISCALIZED',
          message:
            'Маркированный заказ: сначала отсканируйте коды и выбейте чек (кнопка «Фискализировать»), потом выдача',
        });
      }
    }
    // check-then-act ДОЛЖЕН быть атомарным: статус читался вне транзакции, и до
    // записи его мог сменить параллельный процесс (вебхук оплаты, автоотмена).
    // Пишем с guard'ом status=expectedFrom прямо в UPDATE; 0 обновлённых строк =
    // гонку проиграли. Резервы трогаем ТОЛЬКО при реально применённом переходе.
    const expectedFrom = cur.status;
    const applied = await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({
          status,
          ...(status === 'cancelled'
            ? { cancelReason: reason?.trim() || 'Отменён владельцем' }
            : {}),
          ...(status === 'paid' ? { paidAt: sql`now()` } : {}),
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(orders.id, id),
            eq(orders.status, expectedFrom),
            // Отмена фискализированного (или фискализируемого прямо сейчас)
            // заказа запрещена: чек уже выбит/уходит — сначала чек возврата.
            ...(status === 'cancelled'
              ? [isNull(orders.fiscalReceiptId)]
              : []),
          ),
        )
        .returning({ id: orders.id });
      if (!updated.length) return false;
      if (status === 'cancelled') {
        await tx
          .update(stockReservations)
          .set({ status: 'released', updatedAt: sql`now()` })
          .where(
            and(
              eq(stockReservations.orderId, id),
              eq(stockReservations.status, 'active'),
            ),
          );
      } else if (status === 'completed' || status === 'shipped') {
        await tx
          .update(stockReservations)
          .set({ status: 'committed', updatedAt: sql`now()` })
          .where(
            and(
              eq(stockReservations.orderId, id),
              eq(stockReservations.status, 'active'),
            ),
          );
      }
      return true;
    });
    if (!applied) {
      // Проигранная гонка. Если параллельный писатель привёл заказ в ТОТ ЖЕ
      // целевой статус — исход достигнут, отвечаем идемпотентным успехом (не 409);
      // иначе переход устарел. Побочки (резерв) уже применил победитель.
      const [after] = await this.db
        .select({
          status: orders.status,
          fiscalReceiptId: orders.fiscalReceiptId,
        })
        .from(orders)
        .where(eq(orders.id, id));
      if (after?.status === status) return { id, status };
      if (status === 'cancelled' && after?.fiscalReceiptId) {
        throw new ConflictException({
          code: 'ORDER_FISCALIZED',
          message:
            'Заказ фискализирован (или фискализация идёт) — отмена только после чека возврата в ЮKassa',
        });
      }
      throw new ConflictException({
        code: 'ORDER_TRANSITION_FORBIDDEN',
        message: `Переход «${expectedFrom}» → «${status}» устарел (заказ изменён параллельно)`,
      });
    }
    await this.catalog.invalidate();
    this.log.log(`заказ #${id}: статус → ${status}`);
    return { id, status };
  }

  // ---------- автоотмена неоплаченных (ТЗ 8.2) ----------

  async cancelExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - this.paymentTtlMin * 60_000);
    const expired = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(eq(orders.status, 'awaiting_payment'), lt(orders.createdAt, cutoff)),
      );
    if (!expired.length) return 0;
    const ids = expired.map((e) => e.id);
    const cancelledIds = await this.db.transaction(async (tx) => {
      // Guard status='awaiting_payment' В САМОМ UPDATE: если заказ успели
      // оплатить (вебхук выставил 'paid') между SELECT и транзакцией — предикат
      // его НЕ тронет, оплата не потеряется. Резерв освобождаем ТОЛЬКО у реально
      // отменённых (по RETURNING), а не по всему исходному ids — иначе сняли бы
      // резерв с только что оплаченного заказа (риск перепродажи).
      const cancelled = await tx
        .update(orders)
        .set({
          status: 'cancelled',
          cancelReason: 'Автоотмена: заказ не оплачен вовремя',
          updatedAt: sql`now()`,
        })
        .where(
          and(inArray(orders.id, ids), eq(orders.status, 'awaiting_payment')),
        )
        .returning({ id: orders.id });
      const cIds = cancelled.map((c) => c.id);
      if (cIds.length) {
        await tx
          .update(stockReservations)
          .set({ status: 'released', updatedAt: sql`now()` })
          .where(
            and(
              inArray(stockReservations.orderId, cIds),
              eq(stockReservations.status, 'active'),
            ),
          );
      }
      return cIds;
    });
    if (cancelledIds.length) await this.catalog.invalidate();
    this.log.warn(`автоотмена неоплаченных заказов: ${cancelledIds.length}`);
    return cancelledIds.length;
  }

  // ---------- вебхук результата оплаты ЮKassa (Этап 3, шаг 2) ----------

  /**
   * Приём уведомления ЮKassa о смене статуса платежа.
   *
   * У ЮKassa НЕТ HMAC-подписи (проверено на первоисточнике). Надёжность даёт
   * АВТОРИТЕТНЫЙ перезапрос платежа из API (главный контроль: подделать статус
   * нельзя — по чужому/выдуманному id вернётся его истинный статус) + IP-фильтр
   * (второй эшелон). Сумму сверяем с НАШЕЙ БД (totalKopecks), а не с телом.
   *
   * Ответы (семантика ЮKassa: не-2xx → повтор до 24ч):
   *  - обработано/дубль/неизвестный платёж/чужое событие → 200 (return);
   *  - кривой формат → 400; IP вне списка при включённой строгой проверке → 403;
   *  - занято параллельной доставкой / перезапрос не удался → 503 (повтор).
   */
  async handlePaymentWebhook(body: unknown, clientIp: string): Promise<void> {
    // 1. IP-источник (второй эшелон; главный контроль — перезапрос ниже).
    if (!ipAllowed(clientIp)) {
      this.log.warn(`вебхук оплаты: IP вне списка ЮKassa — ${clientIp}`);
      if (this.verifyWebhookIp) {
        throw new ForbiddenException('IP не из списка ЮKassa');
      }
    }
    // 2. Разбор уведомления.
    let note: WebhookNotification;
    try {
      note = parseWebhookNotification(body);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    // Шаг 2 обрабатывает только платёжные исходы; refund.* и прочее — подтверждаем.
    if (note.event !== 'payment.succeeded' && note.event !== 'payment.canceled') {
      this.log.log(`вебхук оплаты: событие ${note.event} — пропуск`);
      return;
    }
    // 3. АВТОРИТЕТНЫЙ перезапрос статуса. Бросок (сеть/5xx) → 503 (повтор ЮKassa).
    const payment = await this.payment.getPayment(note.paymentId);
    if (!payment) {
      this.log.warn(`вебхук оплаты: платёж ${note.paymentId} не найден в ЮKassa`);
      return; // 200: ретраить нечего
    }
    // 4. Дедуп по (id платежа + авторитетный статус).
    const eventId = `pay:${payment.id}:${payment.status}`;
    const claim = await this.claimPaymentEvent(eventId, note.event, {
      note,
      payment,
    });
    if (claim === 'duplicate') return; // уже обработано → 200
    if (claim === 'busy') {
      throw new ServiceUnavailableException('Уведомление уже обрабатывается');
    }
    // 5. Связать с заказом и применить решение.
    try {
      const order = await this.findOrderForPayment(payment);
      if (!order) {
        this.log.warn(`вебхук оплаты: заказ для платежа ${payment.id} не найден`);
        await this.markPaymentEvent(eventId, 'processed');
        return; // 200: ретраить нечего
      }
      const decision = decidePaymentAction({
        paymentStatus: payment.status,
        paid: payment.paid,
        paidKopecks: payment.amountKopecks,
        expectedKopecks: order.totalKopecks,
        orderStatus: order.status,
      });
      // Причина ручного разбора (рассинхрон денег и заказа). Если задана —
      // событие фиксируем как FAILED: долговечный след, который видит мониторинг
      // (п.9) и который переживёт недоступность Telegram; иначе — processed.
      let attention = decision.alert ? decision.reason : null;
      if (decision.action === 'mark_paid') {
        const outcome = await this.markPaidFromWebhook(order.id, payment);
        if (outcome === 'paid_but_cancelled') {
          attention = 'оплата на отменённом заказе — нужен возврат покупателю';
        }
      } else if (decision.action === 'cancel') {
        await this.setStatusIdempotent(
          order.id,
          'cancelled',
          'Оплата отменена в ЮKassa',
        );
        this.log.log(`заказ #${order.id}: отменён (оплата не прошла)`);
      } else {
        this.log.log(
          `вебхук оплаты заказа #${order.id}: ${decision.reason} — без действия`,
        );
      }
      if (attention) {
        // best-effort уведомление (может не дойти) + долговечная пометка события.
        await this.telegram
          .alert(
            `Оплата требует внимания: заказ #${order.id}`,
            `Платёж ЮKassa ${payment.id}: ${attention}. ` +
              `Сумма платежа ${(payment.amountKopecks / 100).toFixed(2)}₽, ` +
              `заказа ${(order.totalKopecks / 100).toFixed(2)}₽, ` +
              `статус заказа «${order.status}».`,
          )
          .catch(() => undefined);
        await this.markPaymentEvent(
          eventId,
          'failed',
          `заказ #${order.id}: ${attention}`,
        );
      } else {
        await this.markPaymentEvent(eventId, 'processed');
      }
    } catch (err) {
      await this.markPaymentEvent(eventId, 'failed', (err as Error).message).catch(
        () => undefined,
      );
      throw err; // → 503/500: ЮKassa повторит
    }
  }

  /** Заказ по внешнему id платежа, запасной путь — по metadata.order_id. */
  private async findOrderForPayment(
    p: AuthoritativePayment,
  ): Promise<{ id: number; status: OrderStatus; totalKopecks: number } | null> {
    const cols = {
      id: orders.id,
      status: orders.status,
      totalKopecks: orders.totalKopecks,
    };
    const [byExt] = await this.db
      .select(cols)
      .from(orders)
      .where(eq(orders.paymentExternalId, p.id))
      .limit(1);
    if (byExt) return byExt;
    if (p.metadataOrderId) {
      const [byId] = await this.db
        .select(cols)
        .from(orders)
        .where(eq(orders.id, p.metadataOrderId))
        .limit(1);
      if (byId) return byId;
    }
    return null;
  }

  /**
   * Собрать чек 54-ФЗ для заказа (шаг 3). null — фискализация выключена. Сбой
   * сборки НЕ блокирует продажу: платёж уйдёт без чека, но громко сообщаем —
   * фискализация обязательна, разрыв закрывается вручную.
   */
  private buildOrderReceipt(
    lines: Array<{
      p: {
        name: string;
        priceRub: number;
        categorySlug: string | null;
        isMarked: boolean;
      };
      quantity: number;
    }>,
    discountRub: number,
    deliveryRub: number,
    totalRub: number,
    dto: CreateOrderDto,
    discountCategorySlug: string | null,
  ): Receipt | null {
    if (!this.receiptConfig) return null;
    // Маркированный заказ: кодов «Честного знака» ещё нет (сканируют при
    // сборке, ТЗ р.11), но чек в момент оплаты ОБЯЗАТЕЛЕН — и по 54-ФЗ
    // (деньги получены до передачи товара = предоплата), и по ЮKassa
    // (режим «Принимать платёж» отклоняет платёж без чека — песочница 20.07).
    // Поэтому: сейчас чек ПРЕДОПЛАТЫ (full_prepayment, строки БЕЗ кодов),
    // а после сборки — чек ЗАЧЁТА с кодами (fiscalizeOrder, prepayment).
    if (lines.some((l) => l.p.isMarked)) {
      this.log.log(
        'заказ с маркированным товаром — чек предоплаты сейчас, коды ЧЗ уйдут чеком зачёта после сборки',
      );
      try {
        return buildReceipt({
          lines: lines.map((l) => ({
            description: l.p.name,
            priceKopecks: rubToKopecks(l.p.priceRub),
            quantity: l.quantity,
            discountEligible:
              discountCategorySlug === null ||
              l.p.categorySlug === discountCategorySlug,
            // маркировку НЕ передаём: в чеке предоплаты кодов нет
          })),
          discountKopecks: rubToKopecks(discountRub),
          deliveryKopecks: rubToKopecks(deliveryRub),
          totalKopecks: rubToKopecks(totalRub),
          customer: { email: dto.email, phone: normalizePhone(dto.phone) },
          config: { ...this.receiptConfig, paymentMode: 'full_prepayment' },
        });
      } catch (err) {
        this.log.error(
          `чек предоплаты не собран (итог ${totalRub}₽): ${(err as Error).message}`,
        );
        void this.telegram
          .alert('Чек предоплаты 54-ФЗ не собран', (err as Error).message)
          .catch(() => undefined);
        return null;
      }
    }
    try {
      return buildReceipt({
        lines: lines.map((l) => ({
          description: l.p.name,
          priceKopecks: rubToKopecks(l.p.priceRub),
          quantity: l.quantity,
          // Категорийная скидка действует только на свою категорию (иначе
          // цена чужой позиции в фиск. чеке была бы занижена).
          discountEligible:
            discountCategorySlug === null ||
            l.p.categorySlug === discountCategorySlug,
        })),
        discountKopecks: rubToKopecks(discountRub),
        deliveryKopecks: rubToKopecks(deliveryRub),
        totalKopecks: rubToKopecks(totalRub),
        // Телефон в чек — нормализованный (+79990001122): ЮKassa не примет
        // маску «+7 (999) 000-11-22» из формы.
        customer: { email: dto.email, phone: normalizePhone(dto.phone) },
        config: this.receiptConfig,
      });
    } catch (err) {
      this.log.error(
        `чек 54-ФЗ не собран (итог ${totalRub}₽): ${(err as Error).message}`,
      );
      void this.telegram
        .alert('Чек 54-ФЗ не собран', (err as Error).message)
        .catch(() => undefined);
      return null;
    }
  }

  /**
   * Пометить заказ оплаченным по вебхуку. Исход:
   *  - 'paid'               — перевели awaiting_payment→paid;
   *  - 'paid_but_cancelled' — между решением и записью автоотмена по TTL увела
   *    заказ в cancelled (ConflictException из атомарного setStatus): деньги
   *    пришли на неоплачиваемый заказ, нужен ручной разбор (алерт+след — выше);
   *  - 'skipped'            — заказ параллельно оплатили другим путём.
   */
  private async markPaidFromWebhook(
    orderId: number,
    payment: AuthoritativePayment,
  ): Promise<'paid' | 'skipped' | 'paid_but_cancelled'> {
    try {
      await this.setStatus(orderId, 'paid');
      this.log.log(`заказ #${orderId}: оплачен (ЮKassa ${payment.id})`);
      return 'paid';
    } catch (err) {
      if (!(err instanceof ConflictException)) throw err;
      const [now] = await this.db
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId));
      if (now?.status === 'cancelled') {
        this.log.warn(
          `заказ #${orderId}: оплата на отменённом заказе — нужен возврат`,
        );
        return 'paid_but_cancelled';
      }
      this.log.log(
        `заказ #${orderId}: 'paid' уже применён параллельно (статус ${now?.status ?? '—'}) — пропуск`,
      );
      return 'skipped';
    }
  }

  /**
   * setStatus, но стойкий к гонке: если параллельная доставка уже увела заказ
   * в несовместимый статус (ConflictException), считаем переход устаревшим и не
   * зацикливаем повторы вебхука. Одинаковый статус setStatus и так гасит сам.
   */
  private async setStatusIdempotent(
    id: number,
    status: OrderStatus,
    reason?: string,
  ): Promise<void> {
    try {
      await this.setStatus(id, status, reason);
    } catch (err) {
      if (err instanceof ConflictException) {
        this.log.warn(
          `вебхук оплаты: переход заказа #${id} → ${status} устарел (заказ уже изменён)`,
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Claim события оплаты с дедупликацией (тот же приём, что у Эвотора, source
   * 'payment'): 'claimed' — наше (новое или оживлён 'failed'/брошенный
   * 'received' старше 5 мин); 'duplicate' — уже processed; 'busy' — держит
   * параллельная доставка.
   */
  private async claimPaymentEvent(
    eventId: string,
    type: string,
    payload: unknown,
  ): Promise<'claimed' | 'duplicate' | 'busy'> {
    const claimed = await this.db
      .insert(webhookEvents)
      .values({ source: 'payment', eventId, type, payload: payload ?? {} })
      .onConflictDoUpdate({
        target: [webhookEvents.source, webhookEvents.eventId],
        set: { status: 'received', error: null, receivedAt: sql`now()` },
        setWhere: sql`${webhookEvents.status} = 'failed' or (${webhookEvents.status} = 'received' and ${webhookEvents.receivedAt} < now() - interval '5 minutes')`,
      })
      .returning({ id: webhookEvents.id });
    if (claimed.length) return 'claimed';
    const [row] = await this.db
      .select({ status: webhookEvents.status })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.source, 'payment'),
          eq(webhookEvents.eventId, eventId),
        ),
      );
    return row && row.status !== 'processed' ? 'busy' : 'duplicate';
  }

  private async markPaymentEvent(
    eventId: string,
    status: 'processed' | 'failed',
    error?: string,
  ): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ status, error: error ?? null, processedAt: sql`now()` })
      .where(
        and(
          eq(webhookEvents.source, 'payment'),
          eq(webhookEvents.eventId, eventId),
          // 'failed' не должен перетирать зафиксированный 'processed'
          ...(status === 'failed'
            ? [sql`${webhookEvents.status} <> 'processed'`]
            : []),
        ),
      );
  }

  onModuleInit(): void {
    // простой фоновый цикл; на этапе 3 переедет в надёжную очередь (Bull)
    this.sweeper = setInterval(() => {
      this.cancelExpired().catch((err: Error) =>
        this.log.error(`автоотмена: ${err.message}`),
      );
    }, 60_000);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^8/, '7');
  return `+${digits}`;
}
