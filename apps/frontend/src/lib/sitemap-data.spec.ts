import { describe, expect, test } from "bun:test";
import { collectCatalogSlugs } from "./sitemap-data";

/**
 * Сбор слагов товаров для карты сайта.
 *
 * Бэкенд отдаёт каталог СТРАНИЦАМИ (perPage максимум 48, дефолт 12) и не
 * знает параметра limit. Старый код просил /catalog?limit=1000 — параметр
 * молча отбрасывался, и в карту попадала только первая страница: на 13-м
 * товаре sitemap начал бы терять позиции. Поэтому сбор обязан пройти ВСЕ
 * страницы по pagination.pageCount.
 */
const page = (slugs: string[], pageCount: number) => ({
  items: slugs.map((slug) => ({ slug })),
  pagination: { pageCount },
});

describe("collectCatalogSlugs", () => {
  test("одна страница — все слаги из неё", async () => {
    const slugs = await collectCatalogSlugs(async () => page(["a", "b"], 1));
    expect(slugs).toEqual(["a", "b"]);
  });

  test("несколько страниц — обходит все по pageCount", async () => {
    const calls: number[] = [];
    const slugs = await collectCatalogSlugs(async (p) => {
      calls.push(p);
      return page([`p${p}-1`, `p${p}-2`], 3);
    });
    expect(calls).toEqual([1, 2, 3]);
    expect(slugs).toEqual(["p1-1", "p1-2", "p2-1", "p2-2", "p3-1", "p3-2"]);
  });

  test("ответ без pagination — только первая страница, без бесконечного цикла", async () => {
    const slugs = await collectCatalogSlugs(async () => ({ items: [{ slug: "x" }] }));
    expect(slugs).toEqual(["x"]);
  });

  test("страховка от разноса: не больше maxPages страниц", async () => {
    const calls: number[] = [];
    await collectCatalogSlugs(async (p) => {
      calls.push(p);
      return page(["y"], 9999);
    }, 5);
    expect(calls.length).toBe(5);
  });

  test("кривые элементы без slug выбрасываются", async () => {
    const slugs = await collectCatalogSlugs(async () => ({
      items: [{ slug: "ok" }, {}, { slug: "" }, { slug: 42 }],
      pagination: { pageCount: 1 },
    }));
    expect(slugs).toEqual(["ok"]);
  });

  test("ошибка сети на второй странице не теряет первую", async () => {
    const slugs = await collectCatalogSlugs(async (p) => {
      if (p === 2) throw new Error("сеть моргнула");
      return page(["first"], 3);
    });
    expect(slugs).toEqual(["first"]);
  });
});
