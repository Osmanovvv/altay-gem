import { describe, expect, test } from "bun:test";
import {
  CHANNEL_LINKS,
  type Channel,
  bannerLinkProps,
  catalogTo,
  productTo,
  promoTo,
} from "./channel-routes";

const CHANNELS: Channel[] = ["site", "max"];

describe("маршруты по каналу", () => {
  test("на сайте — обычные маршруты витрины", () => {
    expect(catalogTo("site")).toBe("/catalog");
    expect(productTo("site")).toBe("/product/$slug");
    expect(promoTo("site")).toBe("/promo");
  });

  test("в мини-аппе — маршруты внутри /max", () => {
    expect(catalogTo("max")).toBe("/max/catalog");
    expect(productTo("max")).toBe("/max/product/$slug");
  });

  /**
   * Ради этого теста всё и затевалось. Главную мини-аппа собирают ТЕ ЖЕ секции,
   * что и главную сайта, а у них внутри ссылки на «/catalog» и «/product/...».
   * Стоит забыть один переход — и покупатель, ткнув в категорию, вываливается
   * из приложения на сайт: пропадает нижняя панель вкладок и вернуться уже
   * нечем. Поэтому проверяем не отдельные функции, а ПРАВИЛО: в канале max ни
   * один маршрут не выходит за пределы /max.
   */
  test("в мини-аппе ни одна ссылка не выводит наружу", () => {
    for (const to of CHANNEL_LINKS.map((f) => f("max"))) {
      expect(to.startsWith("/max/")).toBe(true);
    }
  });

  test("на сайте ни одна ссылка не ведёт внутрь мини-аппа", () => {
    for (const to of CHANNEL_LINKS.map((f) => f("site"))) {
      expect(to.startsWith("/max")).toBe(false);
    }
  });

  /** Каждая функция обязана отвечать на оба канала — иначе ссылка «повиснет». */
  test("все переходы определены для обоих каналов", () => {
    for (const f of CHANNEL_LINKS) {
      for (const ch of CHANNELS) {
        expect(typeof f(ch)).toBe("string");
        expect(f(ch).length).toBeGreaterThan(1);
      }
    }
  });

  /**
   * У мини-аппа нет своей страницы акций. Пока её нет, «Акции» ведут в каталог —
   * это осознанная замена, а не забытая ссылка, и она зафиксирована тестом:
   * появится /max/promo — тест упадёт и напомнит поменять.
   */
  test("акции в мини-аппе ведут в каталог, пока своей страницы нет", () => {
    expect(promoTo("max")).toBe("/max/catalog");
  });
});

describe("ссылка баннера промо-карусели", () => {
  const category = { type: "category" as const, slug: "zdorovie-altaya" };
  const promo = { type: "promo" as const, slug: "osennyaya-rasprodazha" };

  test("сайт, баннер категории — в каталог с фильтром", () => {
    expect(bannerLinkProps("site", category)).toEqual({
      to: "/catalog",
      search: { category: "zdorovie-altaya" },
    });
  });

  test("сайт, баннер акции — на страницу акции", () => {
    expect(bannerLinkProps("site", promo)).toEqual({
      to: "/promo/$slug",
      params: { slug: "osennyaya-rasprodazha" },
    });
  });

  test("мини-апп, баннер категории — в свой каталог с фильтром", () => {
    expect(bannerLinkProps("max", category)).toEqual({
      to: "/max/catalog",
      search: { category: "zdorovie-altaya" },
    });
  });

  /**
   * Отдельной страницы акции в мини-аппе нет. Раньше такой баннер уводил на
   * «/promo/...» — то есть из приложения на сайт. Теперь ведёт в каталог.
   */
  test("мини-апп, баннер акции — в каталог, а НЕ на страницу сайта", () => {
    const props = bannerLinkProps("max", promo);
    expect(props.to).toBe("/max/catalog");
    expect("params" in props).toBe(false);
  });

  test("баннер без ссылки — каталог без фильтра", () => {
    expect(bannerLinkProps("max", null)).toEqual({ to: "/max/catalog", search: {} });
    expect(bannerLinkProps("site", null)).toEqual({ to: "/catalog", search: {} });
  });

  test("в мини-аппе любой баннер остаётся внутри /max", () => {
    for (const link of [category, promo, null]) {
      expect(bannerLinkProps("max", link).to.startsWith("/max/")).toBe(true);
    }
  });
});
