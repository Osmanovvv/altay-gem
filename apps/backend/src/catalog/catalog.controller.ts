import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { StrapiService } from '../strapi/strapi.service';
import { CatalogService, ProductCard } from './catalog.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';

/** Публичный API витрины и Mini App (ТЗ р.9). */
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly strapi: StrapiService,
  ) {}

  @Get('catalog')
  async list(@Query() query: CatalogQueryDto) {
    let items = await this.catalog.enrichedProducts();

    if (query.category) {
      items = items.filter((c) => c.categorySlug === query.category);
    }
    if (query.subcategory) {
      items = items.filter((c) => c.subcategory === query.subcategory);
    }
    if (query.priceMin !== undefined) {
      items = items.filter((c) => c.priceRub >= query.priceMin!);
    }
    if (query.priceMax !== undefined) {
      items = items.filter((c) => c.priceRub <= query.priceMax!);
    }
    if (query.inStock) {
      items = items.filter((c) => c.inStock);
    }
    if (query.q) {
      const q = query.q.toLowerCase();
      // Поиск по названию, подкатегории и описанию (ТЗ 6.9)
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.subcategory ?? '').toLowerCase().includes(q) ||
          (c.shortDescription ?? '').toLowerCase().includes(q),
      );
    }

    const sort = query.sort ?? 'price_asc';
    const sorters: Record<string, (a: ProductCard, b: ProductCard) => number> =
      {
        price_asc: (a, b) => a.priceRub - b.priceRub,
        price_desc: (a, b) => b.priceRub - a.priceRub,
        name: (a, b) => a.name.localeCompare(b.name, 'ru'),
      };
    items = [...items].sort(sorters[sort]);

    const page = query.page ?? 1;
    const perPage = query.perPage ?? 12;
    const total = items.length;
    const pageCount = Math.max(1, Math.ceil(total / perPage));

    return {
      items: items.slice((page - 1) * perPage, page * perPage),
      pagination: { page, perPage, total, pageCount },
      categoryCounts: await this.catalog.categoryCounts(),
    };
  }

  @Get('categories')
  async categories() {
    const [cats, counts] = await Promise.all([
      this.strapi.categories(),
      this.catalog.categoryCounts(),
    ]);
    return cats.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description ?? null,
      photo: this.strapi.mediaUrl(c.photo ?? null),
      sortOrder: c.sortOrder,
      priorityInMax: c.priorityInMax,
      productCount: counts[c.slug] ?? 0,
      subcategories: [...(c.subcategories ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => s.name),
    }));
  }

  @Get('products/:slug')
  async product(@Param('slug') slug: string) {
    const detail = await this.catalog.productBySlug(slug);
    if (!detail) throw new NotFoundException('Товар не найден');
    return detail;
  }

  @Get('home')
  async home() {
    const [{ hero, hits }, banners, settings] = await Promise.all([
      this.catalog.homeProducts(),
      this.strapi.banners(),
      this.strapi.siteSettings(),
    ]);
    return {
      hero,
      hits,
      banners: banners.map((b) => ({
        title: b.title,
        badge: b.badge ?? null,
        description: b.description ?? null,
        buttonText: b.buttonText ?? null,
        // Баннер полноширинный — оптимизированного 1000px мало, отдаём оригинал.
        image: this.strapi.mediaUrl(
          b.image as { url: string } | null | undefined,
          { original: true },
        ),
        link: b.linkPromo
          ? { type: 'promo', slug: (b.linkPromo as { slug: string }).slug }
          : b.linkCategory
            ? {
                type: 'category',
                slug: (b.linkCategory as { slug: string }).slug,
              }
            : null,
        sortOrder: b.sortOrder ?? 0,
      })),
      sections: {
        apiary: settings.apiarySection ?? null,
        history: settings.historySection ?? null,
        advantages: settings.advantages ?? [],
      },
      trust: settings.trust ?? null,
    };
  }

  @Get('promos')
  async promos() {
    const list = await this.strapi.promos();
    return list.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description ?? null,
      // Фото акции живёт и в полноширинном hero детальной — отдаём оригинал.
      image: this.strapi.mediaUrl(
        p.image as { url: string } | null | undefined,
        { original: true },
      ),
      validTo: p.validTo ?? null,
    }));
  }

  @Get('promos/:slug')
  async promo(@Param('slug') slug: string) {
    const [list, cards] = await Promise.all([
      this.strapi.promos(),
      this.catalog.enrichedProducts(),
    ]);
    const p = list.find((x) => x.slug === slug);
    if (!p) throw new NotFoundException('Акция не найдена');
    const memberUuids = new Set(
      ((p.products as Array<{ evotorUuid: string }>) ?? []).map(
        (x) => x.evotorUuid,
      ),
    );
    const strapiProducts = await this.strapi.products();
    const memberSlugs = new Set(
      strapiProducts
        .filter((sp) => memberUuids.has(sp.evotorUuid))
        .map((sp) => sp.slug),
    );
    return {
      slug: p.slug,
      title: p.title,
      description: p.description ?? null,
      detailText: p.detailText ?? null,
      conditions: ((p.conditions as Array<{ text: string }>) ?? []).map(
        (c) => c.text,
      ),
      promocode: (p.promocode as { code: string } | null)?.code ?? null,
      categorySlug: (p.category as { slug: string } | null)?.slug ?? null,
      image: this.strapi.mediaUrl(
        p.image as { url: string } | null | undefined,
        { original: true },
      ),
      validTo: p.validTo ?? null,
      products: cards.filter((c) => memberSlugs.has(c.slug)),
    };
  }

  @Get('reviews')
  async reviews() {
    const list = await this.strapi.reviews();
    const ratings = list.map((r) => Number(r.rating)).filter(Boolean);
    const average = ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10
      : null;
    return {
      average,
      count: ratings.length,
      reviews: list.map((r) => ({
        author: r.author,
        date: r.date,
        rating: r.rating,
        text: r.text,
        source: r.source,
      })),
    };
  }

  @Get('settings')
  async settings() {
    const [site, tariffs] = await Promise.all([
      this.strapi.siteSettings(),
      this.strapi.deliveryTariffs(),
    ]);
    return {
      contacts: site.contacts ?? null,
      storePoints: site.storePoints ?? [],
      socialLinks: site.socialLinks ?? [],
      requisites: site.requisites ?? null,
      privacyPolicy: site.privacyPolicy ?? null,
      reviewYandexUrl: site.reviewYandexUrl ?? null,
      review2gisUrl: site.review2gisUrl ?? null,
      yandexReviewsWidgetUrl: site.yandexReviewsWidgetUrl ?? null,
      trust: site.trust ?? null,
      delivery: {
        courierNskPriceRub: tariffs.courierNskPriceRub ?? null,
        freeDeliveryThresholdRub: tariffs.freeDeliveryThresholdRub ?? null,
        russiaWeightTiers: tariffs.russiaWeightTiers ?? [],
        termsText: tariffs.termsText ?? null,
      },
    };
  }
}
