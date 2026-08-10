import { describe, expect, test } from "bun:test";
import { discountPercent, strikePrice } from "./price-view";

/**
 * Показ зачёркнутой цены на витрине.
 *
 * Правило считает сервер (ТЗ р.4: витрина бизнес-логики не содержит), и в
 * норме он уже не присылает старую цену, когда её показывать нельзя. Но
 * корзина живёт в localStorage: снимок товара со старой ценой переживает и
 * изменение цены в кассе, и деплой. Поэтому то же правило страхует на клиенте
 * — одной функцией на все четыре места, где рисуется зачёркивание, вместо
 * четырёх разных проверок «если oldPrice не пустой».
 */
describe("strikePrice", () => {
  test("старая цена выше текущей — показываем", () => {
    expect(strikePrice(150, 200)).toBe(200);
  });

  test("старая цена ниже текущей — не показываем (цену подняли)", () => {
    expect(strikePrice(150, 100)).toBeNull();
  });

  test("равные цены — скидки нет", () => {
    expect(strikePrice(150, 150)).toBeNull();
  });

  test("пусто, ноль и отрицательные — ничего не показываем", () => {
    expect(strikePrice(150, null)).toBeNull();
    expect(strikePrice(150, undefined)).toBeNull();
    expect(strikePrice(150, 0)).toBeNull();
    expect(strikePrice(150, -10)).toBeNull();
  });

  test("разница меньше процента не считается скидкой", () => {
    expect(strikePrice(150, 150.4)).toBeNull();
  });
});

describe("discountPercent", () => {
  test("процент считается так же, как на сервере", () => {
    expect(discountPercent(150, 200)).toBe(25);
    expect(discountPercent(799, 999)).toBe(20);
    expect(discountPercent(67, 100)).toBe(33);
  });

  test("нет скидки — нет и процента", () => {
    expect(discountPercent(150, 100)).toBeNull();
    expect(discountPercent(150, null)).toBeNull();
    expect(discountPercent(150, 150.4)).toBeNull();
  });
});
