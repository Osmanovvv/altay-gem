import { describe, expect, test } from "bun:test";
import { cartUnitCount } from "./cart-count";

const item = (quantity: number) => ({ quantity });

describe("счётчик корзины в шапке", () => {
  /**
   * Проджект нажал «В корзину» шестнадцать раз, а бейдж всё время показывал
   * «1»: он считал позиции. Со стороны это выглядело как «кнопка не работает».
   * Считаем штуки — тогда каждое нажатие видно.
   */
  test("считает штуки, а не позиции", () => {
    expect(cartUnitCount([item(16)])).toBe(16);
    expect(cartUnitCount([item(3), item(2)])).toBe(5);
  });

  test("пустая корзина — ноль", () => {
    expect(cartUnitCount([])).toBe(0);
  });

  test("мусор в количестве не ломает счёт", () => {
    expect(cartUnitCount([item(2), { quantity: Number.NaN }, item(1)])).toBe(3);
    expect(cartUnitCount([{ quantity: -5 }, item(2)])).toBe(2);
  });
});
