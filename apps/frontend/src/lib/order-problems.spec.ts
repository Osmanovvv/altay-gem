import { describe, expect, test } from "bun:test";

import { orderProblemLines, priceUpdates } from "./order-problems";

const names: Record<string, string> = { a: "Мёд донник", b: "Сыр Граф" };
const nameOf = (id?: string) => (id ? names[id] : undefined) ?? id ?? "товар";

describe("ошибка оформления называет товар", () => {
  test("цена изменилась, не хватает, недоступен — с названием и цифрами", () => {
    expect(
      orderProblemLines(
        [
          { id: "a", reason: "price_changed", actualPriceRub: 520 },
          { id: "b", reason: "out_of_stock", availableQty: 2 },
          { id: "x", reason: "unknown_item" },
        ],
        nameOf,
      ),
    ).toEqual([
      "«Мёд донник»: цена изменилась (теперь 520 ₽)",
      "«Сыр Граф»: доступно только 2",
      "«x»: товар недоступен",
    ]);
  });

  test("подробностей нет или они кривые — пусто, остаётся общий текст", () => {
    expect(orderProblemLines(undefined, nameOf)).toEqual([]);
    expect(orderProblemLines("не массив", nameOf)).toEqual([]);
    expect(orderProblemLines([null, 5], nameOf)).toEqual([]);
  });
});

describe("новые цены для корзины", () => {
  test("берём только price_changed с настоящим числом", () => {
    expect(
      priceUpdates([
        { id: "a", reason: "price_changed", actualPriceRub: 520 },
        { id: "b", reason: "out_of_stock", availableQty: 2 },
        { id: "c", reason: "price_changed" },
        { id: "d", reason: "price_changed", actualPriceRub: Number.NaN },
        { reason: "price_changed", actualPriceRub: 100 },
      ]),
    ).toEqual([{ id: "a", priceRub: 520 }]);
  });
});
