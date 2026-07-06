import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Плоские сущности Strapi v5 (attributes уже развёрнуты). */
export interface StrapiMedia {
  url: string;
  alternativeText?: string | null;
  formats?: Record<string, { url: string }> | null;
}
export interface StrapiProduct {
  documentId: string;
  adminName: string;
  evotorUuid: string;
  slug: string;
  visible: boolean;
  subcategory?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  oldPriceRub?: number | null;
  portionMassG?: number | null;
  deliveryWeightG?: number | null;
  isHit: boolean;
  isNew: boolean;
  isPerishable: boolean;
  heroProduct: boolean;
  photos?: StrapiMedia[] | null;
  category?: { slug: string; name: string } | null;
  characteristics?: {
    weightVolume?: string | null;
    composition?: string | null;
    manufacturer?: string | null;
    shelfLife?: string | null;
    storage?: string | null;
  } | null;
}
export interface StrapiCategory {
  documentId: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  priorityInMax: boolean;
  photo?: StrapiMedia | null;
  subcategories?: Array<{ name: string; sortOrder: number }> | null;
}

/**
 * Клиент контентного API Strapi (источник витринных данных — ТЗ р.4).
 * Доступ по серверному API-токену; наружу Strapi не публикуется.
 */
@Injectable()
export class StrapiService {
  private readonly log = new Logger(StrapiService.name);
  private readonly base: string;
  private readonly token: string;

  constructor(config: ConfigService) {
    this.base = config.get<string>('STRAPI_URL', 'http://localhost:1337');
    this.token = config.get<string>('STRAPI_API_TOKEN', '');
  }

  /** Абсолютный URL для медиафайла Strapi. */
  mediaUrl(media?: StrapiMedia | null): string | null {
    if (!media?.url) return null;
    return media.url.startsWith('http') ? media.url : this.base + media.url;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    if (!this.token) {
      throw new ServiceUnavailableException(
        'STRAPI_API_TOKEN не настроен — витринные данные недоступны',
      );
    }
    const res = await fetch(this.base + path, {
      headers: { Authorization: `Bearer ${this.token}` },
    }).catch((err: Error) => {
      this.log.error(`Strapi недоступен: ${err.message}`);
      throw new ServiceUnavailableException('Каталог временно недоступен');
    });
    if (!res.ok) {
      this.log.error(`Strapi ${path} -> HTTP ${res.status}`);
      throw new ServiceUnavailableException('Каталог временно недоступен');
    }
    return (await res.json()) as T;
  }

  private async fetchAll<T>(path: string, params: string): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    for (;;) {
      const res = await this.fetchJson<{
        data: T[];
        meta: { pagination: { page: number; pageCount: number } };
      }>(
        `${path}?${params}&pagination[page]=${page}&pagination[pageSize]=200`,
      );
      out.push(...res.data);
      if (page >= res.meta.pagination.pageCount) return out;
      page += 1;
    }
  }

  products(): Promise<StrapiProduct[]> {
    return this.fetchAll<StrapiProduct>(
      '/api/products',
      'filters[visible][$eq]=true&populate[photos]=true&populate[category]=true&populate[characteristics]=true',
    );
  }

  categories(): Promise<StrapiCategory[]> {
    return this.fetchAll<StrapiCategory>(
      '/api/categories',
      'populate[photo]=true&populate[subcategories]=true&sort=sortOrder',
    );
  }

  banners(): Promise<Record<string, unknown>[]> {
    return this.fetchAll(
      '/api/banners',
      'filters[active][$eq]=true&populate[image]=true&populate[linkPromo]=true&populate[linkCategory]=true&sort=sortOrder',
    );
  }

  promos(): Promise<Record<string, unknown>[]> {
    return this.fetchAll(
      '/api/promos',
      'filters[active][$eq]=true&populate[image]=true&populate[category]=true&populate[promocode]=true&populate[conditions]=true&populate[products]=true',
    );
  }

  reviews(): Promise<Record<string, unknown>[]> {
    return this.fetchAll(
      '/api/reviews',
      'filters[visible][$eq]=true&sort=date:desc',
    );
  }

  async promocodeByCode(code: string): Promise<{
    code: string;
    active: boolean;
    discountPercent: number;
    validFrom?: string | null;
    validTo?: string | null;
    usageLimit?: number | null;
    categoryRestriction?: { slug: string } | null;
  } | null> {
    const res = await this.fetchJson<{ data: Array<Record<string, unknown>> }>(
      `/api/promocodes?filters[code][$eqi]=${encodeURIComponent(code)}&populate[categoryRestriction]=true`,
    );
    const p = res.data[0];
    if (!p) return null;
    return {
      code: String(p.code),
      active: Boolean(p.active),
      discountPercent: Number(p.discountPercent),
      validFrom: (p.validFrom as string) ?? null,
      validTo: (p.validTo as string) ?? null,
      usageLimit: p.usageLimit == null ? null : Number(p.usageLimit),
      categoryRestriction:
        (p.categoryRestriction as { slug: string } | null) ?? null,
    };
  }

  async siteSettings(): Promise<Record<string, unknown>> {
    const res = await this.fetchJson<{ data: Record<string, unknown> }>(
      '/api/site-setting?populate=*',
    );
    return res.data ?? {};
  }

  async deliveryTariffs(): Promise<Record<string, unknown>> {
    const res = await this.fetchJson<{ data: Record<string, unknown> }>(
      '/api/delivery-tariff?populate[russiaWeightTiers]=true',
    );
    return res.data ?? {};
  }
}
