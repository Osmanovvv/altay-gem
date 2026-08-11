/**
 * Сбор данных для карты сайта. Живёт отдельно от `buildSitemap`, чтобы сборка
 * XML осталась чистой и проверяемой тестами, а сеть — здесь.
 *
 * Правило: карта сайта не имеет права уронить сайт. Любая ошибка API — это
 * карта из одних статических страниц, а не 500-я.
 */
import { buildSitemap } from "./sitemap";

const API_URL: string =
  (import.meta.env?.VITE_API_URL as string | undefined) ?? "http://localhost:3000/api/v1";

/** Канонический адрес: за nginx протокол и хост приходят заголовками. */
function siteUrlFrom(request: Request): string {
  const headers = request.headers;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers.get("host")?.trim() ||
    "ecomarket-altai.ru";
  return `${proto}://${host}`;
}

async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, { signal });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function slugsOf(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { items?: unknown })?.items)
      ? (value as { items: unknown[] }).items
      : [];
  return list
    .map((item) => (item as { slug?: unknown })?.slug)
    .filter((slug): slug is string => typeof slug === "string" && slug.trim() !== "");
}

/**
 * Обойти ВСЕ страницы каталога и собрать слаги товаров.
 *
 * Бэкенд не знает параметра limit (он молча отбрасывается) и отдаёт максимум
 * perPage=48 за запрос — одна страница потеряла бы товары, как только их
 * станет больше страницы. Число страниц берём из pagination.pageCount первого
 * ответа; maxPages — страховка от разноса (50 × 48 = 2400 товаров, с запасом).
 * Ошибка на очередной странице не выбрасывает собранное: карта с частью
 * товаров полезнее пустой.
 */
export async function collectCatalogSlugs(
  fetchPage: (page: number) => Promise<unknown>,
  maxPages = 50,
): Promise<string[]> {
  const slugs: string[] = [];
  let pageCount = 1;
  for (let page = 1; page <= Math.min(pageCount, maxPages); page++) {
    let data: unknown;
    try {
      data = await fetchPage(page);
    } catch {
      break;
    }
    slugs.push(...slugsOf(data));
    const pc = (data as { pagination?: { pageCount?: unknown } })?.pagination?.pageCount;
    if (page === 1) {
      if (typeof pc === "number" && Number.isInteger(pc) && pc > 0) pageCount = pc;
    }
  }
  return slugs;
}

export async function renderSitemap(request: Request): Promise<Response> {
  const siteUrl = siteUrlFrom(request);
  // Поисковый робот ждать не будет, да и держать SSR-процесс незачем.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  let productSlugs: string[] = [];
  let promoSlugs: string[] = [];
  try {
    const [catalog, promos] = await Promise.all([
      collectCatalogSlugs((page) =>
        fetchJson(`/catalog?perPage=48&page=${page}`, controller.signal),
      ),
      fetchJson("/promos", controller.signal),
    ]);
    productSlugs = catalog;
    promoSlugs = slugsOf(promos);
  } catch (error) {
    // Отдаём урезанную карту: пустой sitemap лучше пятисотки в панели вебмастера.
    console.error("sitemap: не удалось получить каталог", error);
  } finally {
    clearTimeout(timer);
  }

  const xml = buildSitemap({
    siteUrl,
    productSlugs,
    promoSlugs,
    lastmod: new Date().toISOString().slice(0, 10),
  });

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
