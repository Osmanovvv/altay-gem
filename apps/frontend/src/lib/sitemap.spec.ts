import { describe, expect, test } from "bun:test";
import { buildSitemap } from "./sitemap";

const SITE = "https://ecomarket-altai.ru";

describe("buildSitemap", () => {
  test("это валидный XML с корнем urlset", () => {
    const xml = buildSitemap({ siteUrl: SITE, productSlugs: [], promoSlugs: [] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  test("статические страницы на месте, служебные — нет", () => {
    const xml = buildSitemap({ siteUrl: SITE, productSlugs: [], promoSlugs: [] });
    for (const path of ["/", "/catalog", "/about", "/delivery", "/reviews", "/privacy", "/promo"]) {
      expect(xml).toContain(`<loc>${SITE}${path}</loc>`);
    }
    // Корзину, оформление, заказ и поиск в индекс не отдаём.
    for (const path of ["/cart", "/checkout", "/order", "/search"]) {
      expect(xml).not.toContain(`<loc>${SITE}${path}</loc>`);
    }
  });

  test("каждый товар витрины получает свой URL", () => {
    const xml = buildSitemap({
      siteUrl: SITE,
      productSlugs: ["syr-graf-monte-kristo", "muka-monastyrskiy-dvor-2-kg"],
      promoSlugs: [],
    });
    expect(xml).toContain(`<loc>${SITE}/product/syr-graf-monte-kristo</loc>`);
    expect(xml).toContain(`<loc>${SITE}/product/muka-monastyrskiy-dvor-2-kg</loc>`);
  });

  test("акции попадают в карту", () => {
    const xml = buildSitemap({ siteUrl: SITE, productSlugs: [], promoSlugs: ["osen-2026"] });
    expect(xml).toContain(`<loc>${SITE}/promo/osen-2026</loc>`);
  });

  test("хвостовой слеш в адресе сайта не даёт двойного слеша", () => {
    const xml = buildSitemap({
      siteUrl: "https://ecomarket-altai.ru/",
      productSlugs: ["myod"],
      promoSlugs: [],
    });
    expect(xml).not.toContain("//product");
    expect(xml).toContain(`<loc>${SITE}/product/myod</loc>`);
  });

  test("спецсимволы в slug не ломают XML", () => {
    const xml = buildSitemap({
      siteUrl: SITE,
      productSlugs: ["чай&травы<hack>"],
      promoSlugs: [],
    });
    expect(xml).not.toContain("<hack>");
    // Ни одного «голого» амперсанда: либо процентная кодировка, либо XML-сущность.
    expect(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml)).toBe(false);
  });

  test("дубликаты слагов не дублируют записи", () => {
    const xml = buildSitemap({ siteUrl: SITE, productSlugs: ["myod", "myod"], promoSlugs: [] });
    const hits = xml.split(`<loc>${SITE}/product/myod</loc>`).length - 1;
    expect(hits).toBe(1);
  });

  test("пустые и мусорные слаги отбрасываются", () => {
    const xml = buildSitemap({
      siteUrl: SITE,
      productSlugs: ["", "  ", "ok"],
      promoSlugs: [],
    });
    expect(xml).toContain(`<loc>${SITE}/product/ok</loc>`);
    expect(xml).not.toContain(`<loc>${SITE}/product/</loc>`);
  });

  test("дата обновления проставляется, если передана", () => {
    const xml = buildSitemap({
      siteUrl: SITE,
      productSlugs: [],
      promoSlugs: [],
      lastmod: "2026-08-09",
    });
    expect(xml).toContain("<lastmod>2026-08-09</lastmod>");
  });
});
