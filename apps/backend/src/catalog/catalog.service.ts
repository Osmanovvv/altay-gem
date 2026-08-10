import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { CacheService } from '../cache/cache.service';
import { DB, type Database } from '../db/database.module';
import { evotorProducts, evotorStores, stockReservations } from '../db/schema';
import {
  resolvePickupStores,
  type PickupPoint,
} from '../orders/pickup-points';
import {
  StrapiProduct,
  StrapiService,
} from '../strapi/strapi.service';
import { perStoreAvailability } from './catalog-availability';
import { cardPriceRub, displayOldPrice } from './catalog-pricing';
import { hasStorefrontCategory } from './publishable';
import { indexReplicaByUuid } from './replica-index';
import { safePortionMassG } from './stock';

/** Карточка товара для списков (контракт витрины, ТЗ р.9). */
export interface ProductCard {
  id: string; // = slug (стабильный публичный идентификатор)
  slug: string;
  name: string;
  categorySlug: string | null;
  categoryName: string | null;
  subcategory: string | null;
  priceRub: number; // для весовых — цена за порцию
  oldPriceRub: number | null;
  badges: string[]; // готовые строки: «Хит», «Новинка», «-N%»
  photo: string | null;
  unit: string; // «шт» | «порция 100 г»
  portionMassG: number | null;
  inStock: boolean;
  availableQty: number; // штук или порций доступно (агрегат по 2 магазинам)
  /** Доступно в каждой точке самовывоза (буферизовано, в единицах продажи). */
  pickupAvailability: Array<{ point: PickupPoint; availableQty: number }>;
  isPerishable: boolean;
  shortDescription: string | null;
}

export interface ProductDetail extends ProductCard {
  fullDescription: string | null;
  photos: string[];
  characteristics: Record<string, string | null>;
  deliveryZone: 'all' | 'nsk_only';
  related: ProductCard[];
  isHero: boolean;
}

interface ReplicaRow {
  storeId: string;
  evotorUuid: string;
  priceKopecks: number;
  quantity: string;
  measure: string;
  matchKey: string;
  allowToSell: boolean;
}

/** Служебные данные товара для оформления заказа (наружу не отдаются). */
export interface ProductInternal {
  slug: string;
  evotorUuid: string; // запись «основного» магазина
  storeId: string;
  matchKey: string;
  measure: string;
  portionMassG: number | null;
  deliveryWeightG: number | null;
  isPerishable: boolean;
  priceRub: number;
  /** Витринная старая цена, уже прошедшая правило показа; null — скидки нет. */
  oldPriceRub: number | null;
  name: string;
  categorySlug: string | null;
  isMarked: boolean;
}

const CACHE_KEY = 'catalog:enriched:v2'; // v2: карточка получила pickupAvailability
const CACHE_TTL_S = 60;

/**
 * Каталог = реплика Эвотора (цены/остатки) + обогащение Strapi (витрина).
 * Остаток агрегируется по двум магазинам через match_key (ТЗ р.8.2).
 * Весовые товары продаются порциями: цена и доступность пересчитываются
 * из цены за кг и массы порции.
 */
@Injectable()
export class CatalogService {
  private readonly log = new Logger(CatalogService.name);
  /** Буфер против двойной продажи: сколько единиц не показываем (ТЗ п.8). */
  private readonly safetyBuffer: number;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly strapi: StrapiService,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.safetyBuffer = config.get<number>('EVOTOR_STOCK_SAFETY_BUFFER') ?? 1;
  }

  /** Полный обогащённый список видимых товаров (кешируется). */
  async enrichedProducts(): Promise<ProductCard[]> {
    return (await this.buildAll()).cards;
  }

  /** Служебная карта slug → данные Эвотора (для заказов; не кешируется наружу). */
  async internalBySlug(): Promise<Map<string, ProductInternal>> {
    return (await this.buildAll()).internal;
  }

  private async buildAll(): Promise<{
    cards: ProductCard[];
    internal: Map<string, ProductInternal>;
  }> {
    const cached = await this.cache.get<{
      cards: ProductCard[];
      internal: Array<[string, ProductInternal]>;
    }>(CACHE_KEY);
    if (cached) {
      return { cards: cached.cards, internal: new Map(cached.internal) };
    }

    const [strapiProducts, replica, reserved, stores] = await Promise.all([
      this.strapi.products(),
      this.db
        .select({
          storeId: evotorProducts.storeId,
          evotorUuid: evotorProducts.evotorUuid,
          priceKopecks: evotorProducts.priceKopecks,
          quantity: evotorProducts.quantity,
          measure: evotorProducts.measure,
          matchKey: evotorProducts.matchKey,
          allowToSell: evotorProducts.allowToSell,
          isMarked: evotorProducts.isMarked,
        })
        .from(evotorProducts)
        .where(
          and(
            eq(evotorProducts.isArchived, false),
            eq(evotorProducts.allowToSell, true),
          ),
        )
        // Порядок задан явно: без него Postgres волен вернуть строки как угодно,
        // и наличие по точкам собиралось бы в разном порядке между прогонами.
        .orderBy(evotorProducts.storeId, evotorProducts.evotorUuid),
      // активные резервы уменьшают доступный остаток немедленно (ТЗ 8.2)
      this.db
        .select({
          storeId: stockReservations.storeId,
          evotorUuid: stockReservations.evotorUuid,
          qty: sql<string>`sum(${stockReservations.quantity})`,
        })
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.status, 'active'),
            or(
              isNull(stockReservations.expiresAt),
              gt(stockReservations.expiresAt, sql`now()`),
            ),
          ),
        )
        .groupBy(stockReservations.storeId, stockReservations.evotorUuid),
      // адреса магазинов → какая точка самовывоза какому storeId соответствует
      this.db
        .select({ id: evotorStores.id, address: evotorStores.address })
        .from(evotorStores),
    ]);
    const pickupStores = resolvePickupStores(stores);

    const reservedByKey = new Map<string, number>();
    for (const r of reserved) {
      reservedByKey.set(`${r.storeId}|${r.evotorUuid}`, Number(r.qty));
    }

    // Один uuid — две строки (по магазину на точку), цены могут различаться.
    // Какая строка представляет товар на витрине, решаем явно и одинаково.
    const byUuid = indexReplicaByUuid(replica);
    // matchKey → [{storeId, qty}] — остаток за вычетом резервов ПО МАГАЗИНАМ
    const qtyByMatchKey = new Map<
      string,
      Array<{ storeId: string; qty: number }>
    >();
    for (const row of replica) {
      const available =
        Number(row.quantity) -
        (reservedByKey.get(`${row.storeId}|${row.evotorUuid}`) ?? 0);
      const list = qtyByMatchKey.get(row.matchKey) ?? [];
      list.push({ storeId: row.storeId, qty: Math.max(available, 0) });
      qtyByMatchKey.set(row.matchKey, list);
    }

    const cards: ProductCard[] = [];
    const internal = new Map<string, ProductInternal>();
    for (const sp of strapiProducts) {
      // Без категории на витрину не публикуем (ТЗ 8.2): иначе товар попадает
      // в «Найдено N», но недостижим фильтром — счётчики категорий врут.
      if (!hasStorefrontCategory(sp)) {
        this.log.warn(
          `товар «${sp.adminName}» без категории — скрыт с витрины до категоризации`,
        );
        continue;
      }
      const rep = byUuid.get(sp.evotorUuid);
      if (!rep) {
        this.log.warn(
          `товар «${sp.adminName}» (${sp.evotorUuid}) не найден в реплике — пропущен`,
        );
        continue;
      }
      const card = this.toCard(
        sp,
        rep,
        qtyByMatchKey.get(rep.matchKey) ?? [],
        pickupStores,
      );
      cards.push(card);
      internal.set(sp.slug, {
        slug: sp.slug,
        evotorUuid: rep.evotorUuid,
        storeId: rep.storeId,
        matchKey: rep.matchKey,
        measure: rep.measure,
        portionMassG: card.portionMassG,
        deliveryWeightG: sp.deliveryWeightG ?? null,
        isPerishable: sp.isPerishable,
        priceRub: card.priceRub,
        oldPriceRub: card.oldPriceRub,
        name: sp.adminName,
        categorySlug: sp.category?.slug ?? null,
        isMarked: rep.isMarked,
      });
    }
    await this.cache.set(
      CACHE_KEY,
      { cards, internal: [...internal.entries()] },
      CACHE_TTL_S,
    );
    return { cards, internal };
  }

  /** Сброс кеша каталога (создание заказа, события Эвотора/Strapi). */
  async invalidate(): Promise<void> {
    await this.cache.invalidatePrefix('catalog:');
  }

  /**
   * Вес единицы товара для расчёта доставки, г. null — вес не задан.
   *
   * Раньше здесь подставлялись 500 г. ТЗ р.12 такой догадки не предусматривает
   * («штучные — по весу из характеристик»), а угаданный вес — это неверная
   * цена доставки в обе стороны, о которой никто не узнает: лёгкие травы
   * уезжали бы как килограмм, тяжёлый мёд — как полкило. Пусть лучше расчёт
   * честно откажет (см. delivery.ts, WEIGHT_UNKNOWN), а владелец увидит в логе,
   * какой карточке не хватает поля.
   */
  unitWeightG(p: ProductInternal): number | null {
    if (p.measure === 'кг') return safePortionMassG(p.portionMassG);
    if (p.deliveryWeightG) return p.deliveryWeightG;
    this.log.warn(
      `у товара «${p.name}» не задан вес для доставки — доставка по России посчитана не будет`,
    );
    return null;
  }

  private toCard(
    sp: StrapiProduct,
    rep: ReplicaRow,
    perStoreQty: Array<{ storeId: string; qty: number }>,
    pickupStores: Array<{ point: PickupPoint; storeId: string }>,
  ): ProductCard {
    const isWeight = rep.measure === 'кг';
    const portionG = safePortionMassG(sp.portionMassG);
    const priceRub = cardPriceRub({
      priceKopecks: rep.priceKopecks,
      measure: rep.measure,
      portionMassG: sp.portionMassG,
    });
    // По-магазинно (порции+буфер на точку), агрегат = сумма — как при заказе.
    const { totalUnits: availableQty, pickupAvailability } =
      perStoreAvailability({
        perStoreQty,
        measure: rep.measure,
        portionMassG: sp.portionMassG,
        buffer: this.safetyBuffer,
        pickupStores,
      });

    const badges: string[] = [];
    if (sp.isHit) badges.push('Хит');
    if (sp.isNew) badges.push('Новинка');
    // Старая цена и «-N%» — одно решение, принимается в одном месте: показать
    // зачёркнутую цену без бейджа (или наоборот) значит соврать покупателю.
    const { oldPriceRub: oldPrice, discountBadge } = displayOldPrice({
      oldPriceRub: sp.oldPriceRub,
      priceRub,
    });
    if (discountBadge) badges.push(discountBadge);

    return {
      id: sp.slug,
      slug: sp.slug,
      name: sp.adminName,
      categorySlug: sp.category?.slug ?? null,
      categoryName: sp.category?.name ?? null,
      subcategory: sp.subcategory ?? null,
      priceRub,
      oldPriceRub: oldPrice,
      badges,
      photo: this.strapi.mediaUrl(sp.photos?.[0] ?? null),
      unit: isWeight ? `порция ${portionG} г` : 'шт',
      portionMassG: isWeight ? portionG : null,
      inStock: availableQty > 0,
      availableQty,
      pickupAvailability,
      isPerishable: sp.isPerishable,
      shortDescription: sp.shortDescription ?? null,
    };
  }

  /** Полная карточка + «с этим покупают» (та же категория, до 4). */
  async productBySlug(slug: string): Promise<ProductDetail | null> {
    const [strapiProducts, cards] = await Promise.all([
      this.strapi.products(),
      this.enrichedProducts(),
    ]);
    const sp = strapiProducts.find((p) => p.slug === slug);
    const card = cards.find((c) => c.slug === slug);
    if (!sp || !card) return null;

    const related = cards
      .filter(
        (c) =>
          c.slug !== slug &&
          // null===null матчил бы ЧУЖИЕ бескатегорийные товары в «похожие».
          card.categorySlug !== null &&
          c.categorySlug === card.categorySlug &&
          c.inStock,
      )
      .slice(0, 4);

    return {
      ...card,
      fullDescription: sp.fullDescription ?? null,
      photos: (sp.photos ?? [])
        .slice(0, 5) // до 5 фото на товар (ТЗ 7.2)
        .map((m) => this.strapi.mediaUrl(m))
        .filter((u): u is string => Boolean(u)),
      characteristics: {
        weightVolume: sp.characteristics?.weightVolume ?? null,
        composition: sp.characteristics?.composition ?? null,
        manufacturer: sp.characteristics?.manufacturer ?? null,
        shelfLife: sp.characteristics?.shelfLife ?? null,
        storage: sp.characteristics?.storage ?? null,
      },
      deliveryZone: card.isPerishable ? 'nsk_only' : 'all',
      related,
      isHero: sp.heroProduct,
    };
  }

  /** Счётчики видимых товаров по категориям (для фильтров и /categories). */
  async categoryCounts(): Promise<Record<string, number>> {
    const cards = await this.enrichedProducts();
    const counts: Record<string, number> = {};
    for (const c of cards) {
      if (c.categorySlug) {
        counts[c.categorySlug] = (counts[c.categorySlug] ?? 0) + 1;
      }
    }
    return counts;
  }

  /** Товары для главной: hero + хиты. */
  async homeProducts(): Promise<{
    hero: ProductDetail | null;
    hits: ProductCard[];
  }> {
    const [strapiProducts, cards] = await Promise.all([
      this.strapi.products(),
      this.enrichedProducts(),
    ]);
    const heroSp = strapiProducts.find((p) => p.heroProduct);
    const hero = heroSp ? await this.productBySlug(heroSp.slug) : null;
    const hitSlugs = new Set(
      strapiProducts.filter((p) => p.isHit).map((p) => p.slug),
    );
    const hits = cards.filter((c) => hitSlugs.has(c.slug)).slice(0, 8);
    return { hero, hits };
  }
}
