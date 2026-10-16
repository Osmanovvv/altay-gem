import { afterEach, describe, expect, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { StrapiService } from './strapi.service';

/**
 * Поддельный Strapi с ЕГО правилами пагинации (сверено с продом 16.10.2026):
 * размер порции режется до rest.maxLimit = 100, а смещение страницы считается
 * от ЗАПРОШЕННОГО pageSize — page=2&pageSize=200 отдаёт записи 200..299.
 * У start/limit смещение точное. reportedTotal — что Strapi пишет в meta.total
 * (может разойтись с фактом, если записи удалили между запросами).
 */
const MAX_LIMIT = 100;

function fakeStrapi(rowsCount: number, reportedTotal = rowsCount) {
  const rows = Array.from({ length: rowsCount }, (_, i) => ({
    documentId: `doc-${i + 1}`,
  }));
  return (input: string | URL | Request): Promise<Response> => {
    const p = new URL(String(input)).searchParams;
    if (p.has('pagination[page]')) {
      const pageSize = Number(p.get('pagination[pageSize]'));
      const start = (Number(p.get('pagination[page]')) - 1) * pageSize;
      const limit = Math.min(pageSize, MAX_LIMIT);
      return Promise.resolve(
        Response.json({
          data: rows.slice(start, start + limit),
          meta: {
            pagination: {
              page: start / limit + 1,
              pageSize: limit,
              pageCount: Math.ceil(reportedTotal / limit),
              total: reportedTotal,
            },
          },
        }),
      );
    }
    const start = Number(p.get('pagination[start]') ?? 0);
    const limit = Math.min(Number(p.get('pagination[limit]') ?? 25), MAX_LIMIT);
    return Promise.resolve(
      Response.json({
        data: rows.slice(start, start + limit),
        meta: { pagination: { start, limit, total: reportedTotal } },
      }),
    );
  };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function service(rowsCount: number, reportedTotal?: number) {
  globalThis.fetch = fakeStrapi(
    rowsCount,
    reportedTotal,
  ) as unknown as typeof fetch;
  return new StrapiService(
    new ConfigService({
      STRAPI_URL: 'http://strapi.test',
      STRAPI_API_TOKEN: 'test-token',
    }),
  );
}

describe('products() забирает ВСЕ карточки, а не каждую вторую сотню', () => {
  test('1079 карточек при лимите Strapi 100 — на витрину уходят все 1079', async () => {
    const got = await service(1079).products();
    expect(got.length).toBe(1079);
    expect(new Set(got.map((p) => p.documentId)).size).toBe(1079);
  });

  test('ровно на границе порции и пустая коллекция', async () => {
    expect((await service(200).products()).length).toBe(200);
    expect((await service(0).products()).length).toBe(0);
  });

  test('записи пропали между запросами (total больше факта) — не зацикливается', async () => {
    expect((await service(120, 150).products()).length).toBe(120);
  });
});
