import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { bannerIsLive } from './banner-window';

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

/** = rest.maxLimit в apps/strapi/config/api.ts: больше Strapi за раз не отдаёт. */
const STRAPI_PAGE_LIMIT = 100;

/**
 * Слаги связанных категорий из ответа Strapi.
 *
 * Терпит ОБА формата — одиночный объект (relation oneToOne) и массив
 * (manyToMany): Strapi и бэкенд деплоятся разными артефактами, и в окне
 * между рестартами формат может не совпасть.
 *
 * ⚠️ Защита ОДНОСТОРОННЯЯ и задаёт порядок деплоя: НОВЫЙ БЭКЕНД ПЕРВЫМ.
 * Новый бэкенд + старая Strapi (объект) — поведение 1-в-1 прежнее, безопасно.
 * Старый бэкенд + новая Strapi (массив) — старый код читает `.slug` у массива,
 * получает undefined, ограничение категорий ИСЧЕЗАЕТ и скидка растекается на
 * всю корзину (потеря денег). Поэтому же ОТКАТ ОДНОГО БЭКЕНДА после миграции
 * схемы Strapi запрещён — откатывать только парой.
 */
export function relationSlugs(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((x) => (x as { slug?: unknown } | null)?.slug)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

/**
 * Клиент контентного API Strapi (источник витринных данных — ТЗ р.4).
 * Доступ по серверному API-токену; наружу Strapi не публикуется.
 */
@Injectable()
export class StrapiService {
  private readonly log = new Logger(StrapiService.name);
  private readonly base: string;
  private readonly publicBase: string;
  private readonly token: string;

  constructor(config: ConfigService) {
    this.base = config.get<string>('STRAPI_URL', 'http://localhost:1337');
    // База для ссылок на медиа, которые уходят в браузер: внутри docker
    // STRAPI_URL = http://strapi:1337 и снаружи недоступен (на проде — домен за nginx)
    this.publicBase = config.get<string>('STRAPI_PUBLIC_URL', this.base);
    this.token = config.get<string>('STRAPI_API_TOKEN', '');
  }

  /**
   * Абсолютный URL медиафайла (доступный из браузера). По умолчанию отдаём
   * ОПТИМИЗИРОВАННЫЙ вариант (large→medium→small→оригинал): Strapi при
   * загрузке сам жмёт и генерирует размерные версии (ТЗ 7.3 «сжатие/
   * web-форматы») — витрине не нужен многомегабайтный оригинал контентщика.
   * { original: true } — для полноширинных баннеров/hero, где 1000px мало.
   */
  mediaUrl(
    media?: StrapiMedia | null,
    opts?: { original?: boolean },
  ): string | null {
    if (!media?.url) return null;
    const f = media.formats ?? undefined;
    const chosen = opts?.original
      ? media.url
      : (f?.large?.url ?? f?.medium?.url ?? f?.small?.url ?? media.url);
    return chosen.startsWith('http') ? chosen : this.publicBase + chosen;
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

  /**
   * Все записи коллекции, порциями по STRAPI_PAGE_LIMIT.
   *
   * ПОЧЕМУ start/limit, А НЕ page/pageSize. Strapi урезает размер порции до
   * rest.maxLimit (apps/strapi/config/api.ts, 100), а смещение страницы считает
   * от ЗАПРОШЕННОГО размера: page=2&pageSize=200 — это «100 записей начиная с
   * 200-й». Бэкенд просил по 200 и получал каждую вторую сотню: когда каталог
   * вырос до 1079 карточек, на витрину попадали 579, остальные молча
   * пропадали, хотя в админке всё было заполнено (найдено 16.10.2026).
   * Смещение по фактически полученному (start = out.length) пропустить ничего
   * не может, какой бы лимит ни стоял в Strapi.
   */
  private async fetchAll<T>(path: string, params: string): Promise<T[]> {
    const out: T[] = [];
    for (;;) {
      const res = await this.fetchJson<{
        data: T[];
        meta: { pagination: { total?: number } };
      }>(
        `${path}?${params}&pagination[start]=${out.length}&pagination[limit]=${STRAPI_PAGE_LIMIT}`,
      );
      out.push(...res.data);
      const total = res.meta.pagination.total;
      // пустая порция — выход, даже если total больше: записи могли удалить на ходу
      if (res.data.length === 0 || (total !== undefined && out.length >= total)) {
        return out;
      }
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

  async banners(): Promise<Record<string, unknown>[]> {
    const all = await this.fetchAll<Record<string, unknown>>(
      '/api/banners',
      'filters[active][$eq]=true&populate[image]=true&populate[linkPromo]=true&populate[linkCategory]=true&sort=sortOrder',
    );
    // Окно показа (ТЗ р.7): active — ручной тумблер, даты — расписание.
    return all.filter((b) => bannerIsLive(b, Date.now()));
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
    /** Категории ограничения; пусто — скидка на всю корзину. */
    categoryRestrictionSlugs: string[];
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
      categoryRestrictionSlugs: relationSlugs(p.categoryRestriction),
    };
  }

  async siteSettings(): Promise<Record<string, unknown>> {
    const res = await this.fetchJson<{ data: Record<string, unknown> }>(
      '/api/site-setting?populate=*',
    );
    return res.data ?? {};
  }

  /**
   * Получатели уведомлений бота — их заводит контент-менеджер в админке.
   * Отдаём как есть: разбор и правила «кому что» живут в notifications.
   */
  notificationRecipients(): Promise<Record<string, unknown>[]> {
    return this.fetchAll('/api/notification-recipients', 'sort=name');
  }

  async deliveryTariffs(): Promise<Record<string, unknown>> {
    const res = await this.fetchJson<{ data: Record<string, unknown> }>(
      '/api/delivery-tariff?populate[russiaWeightTiers]=true',
    );
    return res.data ?? {};
  }
}
