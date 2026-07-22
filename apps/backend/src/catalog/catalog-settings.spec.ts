import { describe, expect, it } from 'bun:test';
import { CatalogController } from './catalog.controller';
import type { CatalogService } from './catalog.service';
import type { StrapiService } from '../strapi/strapi.service';

/**
 * /settings — чистый проброс контент-полей из Strapi (аудит 0-1): текст
 * политики, ссылки на отзывы, URL яндекс-виджета и mapUrl точки. Бизнес-логики
 * нет — проверяем, что новые скаляры доходят из siteSettings() в ответ.
 */
const fakeStrapi = {
  siteSettings: async () => ({
    privacyPolicy: 'PP',
    reviewYandexUrl: 'YU',
    review2gisUrl: 'GU',
    yandexReviewsWidgetUrl: 'WU',
    storePoints: [{ name: 'A', address: 'B', mapUrl: 'M' }],
    requisites: 'R',
  }),
  deliveryTariffs: async () => ({}),
} as unknown as StrapiService;

const controller = new CatalogController(
  null as unknown as CatalogService,
  fakeStrapi,
);

describe('CatalogController.settings — проброс контент-полей', () => {
  it('пробрасывает privacyPolicy/review*Url/yandexReviewsWidgetUrl + mapUrl точки', async () => {
    const res = await controller.settings();
    expect(res.privacyPolicy).toBe('PP');
    expect(res.reviewYandexUrl).toBe('YU');
    expect(res.review2gisUrl).toBe('GU');
    expect(res.yandexReviewsWidgetUrl).toBe('WU');
    expect((res.storePoints as Array<{ mapUrl?: string }>)[0].mapUrl).toBe('M');
    expect(res.requisites).toBe('R');
  });
});
