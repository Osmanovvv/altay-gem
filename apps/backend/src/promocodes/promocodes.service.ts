import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import { CatalogService } from '../catalog/catalog.service';
import { DB, type Database } from '../db/database.module';
import { orders, promocodeUsages } from '../db/schema';
import { StrapiService } from '../strapi/strapi.service';
import {
  CartLine,
  evaluatePromocode,
  PromoResult,
  reject,
} from './discount';

/**
 * Валидация промокодов — только на сервере (ТЗ 8.3).
 * Лимит применений считается по журналу promocode_usages (заказы,
 * кроме отменённых). Используется и чекаутом (шаг 5) при создании заказа.
 */
@Injectable()
export class PromocodesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly strapi: StrapiService,
    private readonly catalog: CatalogService,
  ) {}

  async usedCount(code: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(promocodeUsages)
      .innerJoin(orders, eq(promocodeUsages.orderId, orders.id))
      .where(
        and(eq(promocodeUsages.code, code), ne(orders.status, 'cancelled')),
      );
    return row?.n ?? 0;
  }

  /** Разворачивает позиции корзины (slug+кол-во) в строки с ценой/категорией. */
  async resolveCart(
    items: Array<{ id: string; quantity: number }>,
  ): Promise<{ lines: CartLine[]; unknown: string[] }> {
    const cards = await this.catalog.enrichedProducts();
    const bySlug = new Map(cards.map((c) => [c.slug, c]));
    const lines: CartLine[] = [];
    const unknown: string[] = [];
    for (const item of items) {
      const card = bySlug.get(item.id);
      if (!card) {
        unknown.push(item.id);
        continue;
      }
      lines.push({
        slug: card.slug,
        quantity: item.quantity,
        priceRub: card.priceRub,
        categorySlug: card.categorySlug,
      });
    }
    return { lines, unknown };
  }

  async validate(
    code: string,
    items: Array<{ id: string; quantity: number }>,
  ): Promise<PromoResult & { unknownItems?: string[] }> {
    const normalized = code.trim();
    if (!normalized) return reject('not_found');

    const promo = await this.strapi.promocodeByCode(normalized);
    if (!promo) return reject('not_found');

    const [{ lines, unknown }, used] = await Promise.all([
      this.resolveCart(items),
      this.usedCount(promo.code),
    ]);

    const result = evaluatePromocode(
      {
        code: promo.code,
        active: promo.active,
        discountPercent: promo.discountPercent,
        validFrom: promo.validFrom,
        validTo: promo.validTo,
        usageLimit: promo.usageLimit,
        categoryRestrictionSlug: promo.categoryRestriction?.slug ?? null,
      },
      lines,
      used,
      new Date(),
    );
    return unknown.length ? { ...result, unknownItems: unknown } : result;
  }
}
