import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'bun:test';
import type { CacheService } from '../cache/cache.service';
import type { Database } from '../db/database.module';
import { evotorProducts, evotorStores, stockReservations } from '../db/schema';
import type { StrapiProduct, StrapiService } from '../strapi/strapi.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

function makeCacheStub() {
  const store = new Map<string, string>();
  const cache = {
    async get<T>(key: string): Promise<T | null> {
      const raw = store.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async set(key: string, value: unknown): Promise<void> {
      store.set(key, JSON.stringify(value));
    },
    async invalidatePrefix(prefix: string): Promise<void> {
      for (const k of [...store.keys()]) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    },
  };
  return { cache: cache as unknown as CacheService, store };
}

function makeDbStub(
  replicaRows: Array<Record<string, unknown>>,
  storeRows: Array<Record<string, unknown>>,
) {
  const db = {
    select() {
      return {
        from(tbl: unknown) {
          if (tbl === evotorStores) {
            return Promise.resolve(storeRows);
          }
          return {
            where() {
              if (tbl === evotorProducts) {
                return { orderBy: () => Promise.resolve(replicaRows) };
              }
              if (tbl === stockReservations) {
                return { groupBy: () => Promise.resolve([]) };
              }
              return Promise.resolve([]);
            },
          };
        },
      };
    },
  };
  return db as unknown as Database;
}

const sampleProducts: StrapiProduct[] = [
  {
    documentId: 'doc-hero',
    adminName: 'Мёд донниковый',
    evotorUuid: 'uuid-1',
    slug: 'med-donnikovyy',
    visible: true,
    isHit: true,
    isNew: false,
    isPerishable: false,
    heroProduct: true,
    category: { slug: 'med', name: 'Мёд' },
    shortDescription: 'Кратко',
    fullDescription: 'Подробно',
    photos: [{ url: '/uploads/med.jpg' }],
    characteristics: { manufacturer: 'Алтай' },
  },
  {
    documentId: 'doc-hit',
    adminName: 'Чай таёжный',
    evotorUuid: 'uuid-2',
    slug: 'chay-taezhnyy',
    visible: true,
    isHit: true,
    isNew: true,
    isPerishable: false,
    heroProduct: false,
    category: { slug: 'med', name: 'Мёд' },
  },
];

const sampleReplica = [
  {
    storeId: 'store-1',
    evotorUuid: 'uuid-1',
    priceKopecks: 59000,
    quantity: '5',
    measure: 'шт',
    matchKey: '4601',
    allowToSell: true,
    isMarked: false,
  },
  {
    storeId: 'store-1',
    evotorUuid: 'uuid-2',
    priceKopecks: 32000,
    quantity: '4',
    measure: 'шт',
    matchKey: '4602',
    allowToSell: true,
    isMarked: false,
  },
];

const sampleStores = [{ id: 'store-1', address: 'Ленинградская 75/2' }];

function setupFixture(delayMs = 0) {
  let strapiProductsCalls = 0;
  const { cache, store } = makeCacheStub();
  const strapiStub = {
    async products() {
      strapiProductsCalls += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return sampleProducts;
    },
    mediaUrl(m?: { url?: string } | null) {
      return m?.url ? `https://example.com${m.url}` : null;
    },
    async promos() {
      return [
        {
          slug: 'spring',
          title: 'Весна',
          products: [{ evotorUuid: 'uuid-2' }],
        },
      ];
    },
  };
  const service = new CatalogService(
    makeDbStub(sampleReplica, sampleStores),
    strapiStub as unknown as StrapiService,
    cache,
    new ConfigService({ EVOTOR_STOCK_SAFETY_BUFFER: 1 }),
  );
  const controller = new CatalogController(
    service,
    strapiStub as unknown as StrapiService,
  );
  return {
    service,
    controller,
    cacheStore: store,
    getStrapiProductsCalls: () => strapiProductsCalls,
  };
}

describe('CatalogService кеширование strapiProducts()', () => {
  it('холодный homeProducts() дергает strapi.products() 1 раз и переиспользуется в productBySlug()', async () => {
    const f = setupFixture();

    const home1 = await f.service.homeProducts();
    expect(home1.hero?.slug).toBe('med-donnikovyy');
    expect(home1.hits).toHaveLength(2);
    expect(f.getStrapiProductsCalls()).toBe(1);

    const detail = await f.service.productBySlug('med-donnikovyy');
    expect(detail?.fullDescription).toBe('Подробно');
    expect(detail?.related.map((r) => r.slug)).toEqual(['chay-taezhnyy']);

    const home2 = await f.service.homeProducts();
    expect(home2.hero?.slug).toBe('med-donnikovyy');
    expect(f.getStrapiProductsCalls()).toBe(1);
  });

  it('дедуплицирует параллельные холодные вызовы и сбрасывается через invalidate()', async () => {
    const f = setupFixture(15);

    const [detail, home, cards] = await Promise.all([
      f.service.productBySlug('med-donnikovyy'),
      f.service.homeProducts(),
      f.service.enrichedProducts(),
    ]);
    expect(detail?.slug).toBe('med-donnikovyy');
    expect(home.hero?.slug).toBe('med-donnikovyy');
    expect(cards).toHaveLength(2);
    expect(f.getStrapiProductsCalls()).toBe(1);

    await f.service.invalidate();
    expect(f.cacheStore.size).toBe(0);

    await f.service.productBySlug('chay-taezhnyy');
    expect(f.getStrapiProductsCalls()).toBe(2);
  });

  it('CatalogController.promo() читает товары Strapi через кеш CatalogService', async () => {
    const f = setupFixture();
    const res = await f.controller.promo('spring');
    expect(res.products.map((p) => p.slug)).toEqual(['chay-taezhnyy']);
    expect(f.getStrapiProductsCalls()).toBe(1);

    await f.controller.promo('spring');
    expect(f.getStrapiProductsCalls()).toBe(1);
  });
});
