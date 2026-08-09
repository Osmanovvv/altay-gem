/**
 * Карта сайта (ТЗ, разд. «SEO»: sitemap.xml генерируется динамически).
 *
 * Чистая сборка XML — без сети и без окружения, чтобы её можно было проверить
 * тестами. Данные (слаги товаров и акций) приносит вызывающий код в server.ts.
 */

/** Страницы, которые есть всегда и не зависят от каталога. */
const STATIC_PATHS = [
  "/",
  "/catalog",
  "/promo",
  "/about",
  "/delivery",
  "/reviews",
  "/privacy",
] as const;

/**
 * Приоритет — подсказка для поисковика, что важнее обходить.
 * Главная и каталог выше карточек, служебные страницы ниже.
 */
const PRIORITY: Record<string, string> = {
  "/": "1.0",
  "/catalog": "0.9",
  "/promo": "0.7",
  "/about": "0.5",
  "/delivery": "0.5",
  "/reviews": "0.5",
  "/privacy": "0.3",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Слаг приходит из CMS — в URL он должен быть закодирован, а не вставлен как есть. */
function encodeSlug(slug: string): string {
  return encodeURIComponent(slug.trim());
}

function cleanSlugs(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of slugs) {
    const slug = typeof raw === "string" ? raw.trim() : "";
    if (slug === "" || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function buildSitemap(input: {
  siteUrl: string;
  productSlugs: readonly string[];
  promoSlugs: readonly string[];
  /** Дата последнего изменения в формате YYYY-MM-DD; без неё тег не пишем. */
  lastmod?: string;
}): string {
  const base = input.siteUrl.replace(/\/+$/, "");
  const lastmod = input.lastmod ? `\n    <lastmod>${escapeXml(input.lastmod)}</lastmod>` : "";

  const entry = (path: string, priority: string) =>
    `  <url>\n    <loc>${escapeXml(base + path)}</loc>${lastmod}\n    <priority>${priority}</priority>\n  </url>`;

  const urls: string[] = [];
  for (const path of STATIC_PATHS) urls.push(entry(path, PRIORITY[path] ?? "0.5"));
  for (const slug of cleanSlugs(input.productSlugs)) {
    urls.push(entry(`/product/${encodeSlug(slug)}`, "0.8"));
  }
  for (const slug of cleanSlugs(input.promoSlugs)) {
    urls.push(entry(`/promo/${encodeSlug(slug)}`, "0.6"));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
