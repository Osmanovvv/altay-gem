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

export async function renderSitemap(request: Request): Promise<Response> {
  const siteUrl = siteUrlFrom(request);
  // Поисковый робот ждать не будет, да и держать SSR-процесс незачем.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  let productSlugs: string[] = [];
  let promoSlugs: string[] = [];
  try {
    const [catalog, promos] = await Promise.all([
      fetchJson("/catalog?limit=1000", controller.signal),
      fetchJson("/promos", controller.signal),
    ]);
    productSlugs = slugsOf(catalog);
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
