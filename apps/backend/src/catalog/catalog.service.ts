import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { CacheService } from '../cache/cache.service';
import { DB, type Database } from '../db/database.module';
import { evotorProducts, stockReservations } from '../db/schema';
import {
  StrapiProduct,
  StrapiService,
} from '../strapi/strapi.service';

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
  name: string;
  categorySlug: string | null;
  isMarked: boolean;
}

const CACHE_KEY = 'catalog:enriched:v1';
const CACHE_TTL_S = 60;
/** Вес по умолчанию для расчёта доставки, если контентщик не заполнил, г. */
const FALLBACK_UNIT_WEIGHT_G = 500;

/**
 * Каталог = реплика Эвотора (цены/остатки) + обогащение Strapi (витрина).
 * Остаток агрегируется по двум магазинам через match_key (ТЗ р.8.2).
 * Весовые товары продаются порциями: цена и доступность пересчитываются
 * из цены за кг и массы порции.
 */
@Injectable()
export class CatalogService {
  private readonly log = new Logger(CatalogService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly strapi: StrapiService,
    private readonly cache: CacheService,
  ) {}

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

    const [strapiProducts, replica, reserved] = await Promise.all([
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
        ),
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
    ]);

    const reservedByKey = new Map<string, number>();
    for (const r of reserved) {
      reservedByKey.set(`${r.storeId}|${r.evotorUuid}`, Number(r.qty));
    }

    const byUuid = new Map<string, ReplicaRow & { isMarked: boolean }>();
    const qtyByMatchKey = new Map<string, number>();
    for (const row of replica) {
      byUuid.set(row.evotorUuid, row);
      const available =
        Number(row.quantity) -
        (reservedByKey.get(`${row.storeId}|${row.evotorUuid}`) ?? 0);
      qtyByMatchKey.set(
        row.matchKey,
        (qtyByMatchKey.get(row.matchKey) ?? 0) + Math.max(available, 0),
      );
    }

    const cards: ProductCard[] = [];
    const internal = new Map<string, ProductInternal>();
    for (const sp of strapiProducts) {
      const rep = byUuid.get(sp.evotorUuid);
      if (!rep) {
        this.log.warn(
          `товар «${sp.adminName}» (${sp.evotorUuid}) не найден в реплике — пропущен`,
        );
        continue;
      }
      const card = this.toCard(sp, rep, qtyByMatchKey.get(rep.matchKey) ?? 0);
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

  /** Вес единицы товара для расчёта доставки, г. */
  unitWeightG(p: ProductInternal): number {
    if (p.measure === 'кг') return p.portionMassG ?? 100;
    if (p.deliveryWeightG) return p.deliveryWeightG;
    this.log.warn(
      `у товара «${p.name}» не задан вес для доставки — использую ${FALLBACK_UNIT_WEIGHT_G} г`,
    );
    return FALLBACK_UNIT_WEIGHT_G;
  }

  private toCard(
    sp: StrapiProduct,
    rep: ReplicaRow,
    totalQty: number,
  ): ProductCard {
    const isWeight = rep.measure === 'кг';
    const portionG = sp.portionMassG ?? 100;
    const priceRub = isWeight
      ? Math.round((rep.priceKopecks / 100) * (portionG / 1000))
      : Math.round(rep.priceKopecks / 100);
    const availableQty = isWeight
      ? Math.floor((totalQty * 1000) / portionG) // порции из суммарных кг
      : Math.floor(totalQty);

    const badges: string[] = [];
    if (sp.isHit) badges.push('Хит');
    if (sp.isNew) badges.push('Новинка');
    const oldPrice = sp.oldPriceRub ?? null;
    if (oldPrice && oldPrice > priceRub) {
      badges.push(`-${Math.round((1 - priceRub / oldPrice) * 100)}%`);
    }

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
