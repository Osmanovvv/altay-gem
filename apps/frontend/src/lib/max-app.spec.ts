import { describe, expect, test } from "bun:test";
import { MAX_TABS, highlightCategories, isMaxPath, maxOrderHeaders } from "./max-app";

/**
 * Правила мини-приложения MAX (ТЗ р.13).
 *
 * Отличия от веб-витрины ровно три: нижняя панель вкладок, выделение
 * приоритетных категорий на витрине и источник заказа. Всё остальное —
 * тот же API и та же логика, поэтому здесь только эти три вещи.
 */

const cat = (slug: string, sortOrder: number, priorityInMax = false) => ({
  slug,
  name: slug,
  description: null,
  photo: null,
  sortOrder,
  productCount: 3,
  subcategories: [],
  priorityInMax,
});

describe("MAX_TABS — нижняя панель", () => {
  test("ровно четыре вкладки из ТЗ и в том же порядке", () => {
    expect(MAX_TABS.map((t) => t.label)).toEqual(["Витрина", "Каталог", "Корзина", "Заказ"]);
  });

  test("каждая вкладка ведёт внутрь мини-аппа", () => {
    for (const t of MAX_TABS) expect(t.to.startsWith("/max")).toBe(true);
  });

  test("у вкладки корзины включён счётчик товаров", () => {
    expect(MAX_TABS.find((t) => t.label === "Корзина")?.showsCartCount).toBe(true);
    expect(MAX_TABS.find((t) => t.label === "Витрина")?.showsCartCount).toBeFalsy();
  });
});

describe("highlightCategories — выделение приоритетных (ТЗ р.13)", () => {
  test("приоритетные идут первыми, остальные — следом", () => {
    const list = [cat("a", 1), cat("b", 2, true), cat("c", 3), cat("d", 4, true)];
    expect(highlightCategories(list).map((c) => c.slug)).toEqual(["b", "d", "a", "c"]);
  });

  test("внутри каждой группы сохраняется порядок сортировки из админки", () => {
    const list = [cat("z", 9, true), cat("a", 1, true), cat("m", 5)];
    expect(highlightCategories(list).map((c) => c.slug)).toEqual(["a", "z", "m"]);
  });

  test("ни одна категория не выделена — просто обычный порядок, а не пустота", () => {
    const list = [cat("b", 2), cat("a", 1)];
    expect(highlightCategories(list).map((c) => c.slug)).toEqual(["a", "b"]);
  });

  test("пустой список не ломает витрину", () => {
    expect(highlightCategories([])).toEqual([]);
  });

  test("исходный массив не мутируется (его же рендерит и каталог)", () => {
    const list = [cat("b", 2), cat("a", 1, true)];
    const copy = list.map((c) => c.slug);
    highlightCategories(list);
    expect(list.map((c) => c.slug)).toEqual(copy);
  });
});

describe("maxOrderHeaders — источник заказа", () => {
  test("заказ из мини-аппа помечается источником max", () => {
    expect(maxOrderHeaders()["X-Source"]).toBe("max");
  });
});

describe("isMaxPath", () => {
  test("страницы мини-аппа распознаются", () => {
    expect(isMaxPath("/max")).toBe(true);
    expect(isMaxPath("/max/catalog")).toBe(true);
  });
  test("страницы сайта — нет (иначе на сайте вылезет чужая панель вкладок)", () => {
    expect(isMaxPath("/")).toBe(false);
    expect(isMaxPath("/catalog")).toBe(false);
    expect(isMaxPath("/maximum")).toBe(false);
  });
});
