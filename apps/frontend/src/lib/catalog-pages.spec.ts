import { describe, expect, test } from "bun:test";

import { appendPage, firstPage, hasMore } from "./catalog-pages";

const page = (slugs: string[], p: number, pageCount: number, total: number) => ({
  items: slugs.map((slug) => ({ slug })),
  pagination: { page: p, pageCount, total },
});

describe("догрузка каталога порциями («Показать ещё» в MAX)", () => {
  test("первая страница из нескольких — есть что догружать", () => {
    const list = firstPage(page(["a", "b"], 1, 3, 6));
    expect(list.items.map((i) => i.slug)).toEqual(["a", "b"]);
    expect(hasMore(list)).toBe(true);
  });

  test("следующая порция дописывается в конец, на последней кнопка пропадает", () => {
    let list = firstPage(page(["a", "b"], 1, 2, 4));
    list = appendPage(list, page(["c", "d"], 2, 2, 4));
    expect(list.items.map((i) => i.slug)).toEqual(["a", "b", "c", "d"]);
    expect(hasMore(list)).toBe(false);
  });

  test("позиция, переехавшая между страницами, не задваивается", () => {
    const list = appendPage(firstPage(page(["a", "b"], 1, 2, 4)), page(["b", "c"], 2, 2, 4));
    expect(list.items.map((i) => i.slug)).toEqual(["a", "b", "c"]);
  });

  test("одна страница — догружать нечего", () => {
    expect(hasMore(firstPage(page(["a"], 1, 1, 1)))).toBe(false);
  });
});
