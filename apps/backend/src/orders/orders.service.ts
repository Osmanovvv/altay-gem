import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { CatalogService, ProductInternal } from '../catalog/catalog.service';
import { DB, type Database } from '../db/database.module';
import {
  evotorStores,
  idempotencyKeys,
  orderItems,
  orders,
  promocodeUsages,
  stockReservations,
} from '../db/schema';
import { PromocodesService } from '../promocodes/promocodes.service';
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

const PICKUP_STORE_HINT: Record<string, string> = {
  pickup_leningradskaya: 'Ленинградская',
  pickup_titova: 'Титова',
};

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OrdersService.name);
  private readonly paymentTtlMin: number;
  private sweeper?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly promocodes: PromocodesService,
    private readonly strapi: StrapiService,
    config: ConfigService,
  ) {
    this.paymentTtlMin = Number(
      config.get('ORDER_PAYMENT_TTL_MINUTES') ?? 30,
    );
  }

  // ---------- создание заказа (ТЗ 8.2) ----------

  async create(
    dto: CreateOrderDto,
    source: 'web' | 'max',
    idempotencyKey?: string,
  ): Promise<OrderResponse> {
    // 0. идемпотентность по ключу запроса (ТЗ р.9)
    const requestHash = createHash('sha256')
      .update(JSON.stringify(dto))
      .digest('hex');
    if (idempotencyKey) {
      const [existing] = await this.db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, idempotencyKey));
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Этот Idempotency-Key уже использован с другим запросом',
          });
        }
        return existing.responseBody as unknown as OrderResponse;
      }
    }

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

    // 2. перевалидация состава по актуальному каталогу
    const internal = await this.catalog.internalBySlug();
    const problems: ItemProblem[] = [];
    const lines: Array<{
      p: ProductInternal;
      quantity: number;
    }> = [];
    for (const item of dto.items) {
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
      promoCode = promo.code;
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
    const response = await this.db.transaction(async (tx) => {
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
        const portionKg = (p.portionMassG ?? 100) / 1000;
        const availableQty = isWeight
          ? Math.floor(availableUnits / portionKg)
          : Math.floor(availableUnits);
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
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: 'PENDING',
          status: isOnline ? 'awaiting_payment' : 'new',
          customerName: dto.name.trim(),
          customerPhone: normalizePhone(dto.phone),
          customerEmail: dto.email?.trim() || null,
          deliveryMethod: dto.deliveryMethod,
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          deliveryCostKopecks: deliveryRub * 100,
          paymentMethod: dto.paymentMethod,
          promoCode,
          promoDiscountKopecks: discountRub * 100,
          itemsSubtotalKopecks: subtotalRub * 100,
          totalKopecks: totalRub * 100,
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
          priceKopecks: p.priceRub * 100,
          quantity,
          portionMassG: p.measure === 'кг' ? (p.portionMassG ?? 100) : null,
          unit: p.measure === 'кг' ? `порция ${p.portionMassG ?? 100} г` : 'шт',
          isMarked: p.isMarked,
          sumKopecks: p.priceRub * quantity * 100,
        })),
      );

      const expiresAt = isOnline
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
          discountKopecks: discountRub * 100,
        });
      }

      return {
        id: order.id,
        orderNumber,
        accessToken: order.accessToken,
        status: isOnline ? 'awaiting_payment' : 'new',
        totals: { subtotalRub, discountRub, deliveryRub, totalRub },
        paymentUrl: null,
      } satisfies OrderResponse;
    });

    if (idempotencyKey) {
      await this.db
        .insert(idempotencyKeys)
        .values({
          key: idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseBody: response,
        })
        .onConflictDoNothing();
    }

    await this.catalog.invalidate(); // резерв виден в каталоге сразу
    this.log.log(`заказ ${response.orderNumber} создан (${source})`);
    // Telegram-уведомление магазину — этап 3
    return response;
  }

  private async resolveTargetStore(
    method: DeliveryMethod,
  ): Promise<string | null> {
    const hint = PICKUP_STORE_HINT[method];
    if (!hint) return null; // доставка — магазин записи товара
    const stores = await this.db.select().from(evotorStores);
    const store = stores.find((s) => (s.address ?? '').includes(hint));
    if (!store) {
      throw new BadRequestException({
        code: 'PICKUP_POINT_UNKNOWN',
        message: 'Точка самовывоза не настроена',
      });
    }
    return store.id;
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
    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status: 'cancelled',
          cancelReason: 'Автоотмена: заказ не оплачен вовремя',
          updatedAt: sql`now()`,
        })
        .where(inArray(orders.id, ids));
      await tx
        .update(stockReservations)
        .set({ status: 'released', updatedAt: sql`now()` })
        .where(inArray(stockReservations.orderId, ids));
    });
    await this.catalog.invalidate();
    this.log.warn(`автоотмена неоплаченных заказов: ${ids.length}`);
    return ids.length;
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
