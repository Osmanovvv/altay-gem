import { describe, expect, test } from "bun:test";
import { GAP, pageItems } from "./pagination";

describe("нумерация страниц каталога", () => {
  /**
   * Ради этого всё и переписано. Пока каталог помещался на одну-две страницы,
   * кнопки рисовались подряд и это работало. После загрузки товаров страниц
   * стало 49 — и внизу каталога появилось поле из 49 кружков во весь экран
   * телефона. Выглядит как календарь, а не как переход по страницам.
   */
  test("страниц много — показываем края, окрестности и многоточия", () => {
    expect(pageItems(25, 49)).toEqual([1, GAP, 24, 25, 26, GAP, 49]);
  });

  test("в начале списка многоточие только справа", () => {
    expect(pageItems(1, 49)).toEqual([1, 2, 3, GAP, 49]);
    expect(pageItems(2, 49)).toEqual([1, 2, 3, GAP, 49]);
  });

  test("в конце списка многоточие только слева", () => {
    expect(pageItems(49, 49)).toEqual([1, GAP, 47, 48, 49]);
    expect(pageItems(48, 49)).toEqual([1, GAP, 47, 48, 49]);
  });

  test("мало страниц — показываем все, без многоточий", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 3)).toEqual([1, 2, 3]);
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  /**
   * Многоточие вместо ОДНОЙ спрятанной страницы — бессмысленно: занимает столько
   * же места, а нажать нельзя. В таком случае показываем саму страницу.
   */
  test("если многоточие прячет всего одну страницу — показываем её", () => {
    // 1 … 4 5 6 … 8  →  между 1 и 4 прячется только 2 и 3? нет: 2 страницы.
    // Настоящий одиночный пропуск даёт восемь страниц при текущей четвёртой:
    // края 1 и 8, окрестности 3,4,5 — между 5 и 8 сидит один только 6 и 7.
    const items = pageItems(4, 8);
    expect(items).toEqual([1, 2, 3, 4, 5, GAP, 8]);
    // между 1 и 3 пропуск был бы в одну страницу — она раскрыта
    expect(items.indexOf(2)).toBeGreaterThan(-1);
  });

  test("номера идут по возрастанию и не повторяются", () => {
    for (const [cur, total] of [[1, 49], [7, 49], [25, 49], [49, 49], [4, 8]] as const) {
      const nums = pageItems(cur, total).filter((x): x is number => x !== GAP);
      expect([...new Set(nums)]).toEqual(nums);
      expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    }
  });

  test("текущая страница всегда в списке", () => {
    for (let cur = 1; cur <= 49; cur++) {
      expect(pageItems(cur, 49)).toContain(cur);
    }
  });

  test("первая и последняя всегда доступны", () => {
    for (const cur of [1, 12, 25, 40, 49]) {
      const items = pageItems(cur, 49);
      expect(items[0]).toBe(1);
      expect(items[items.length - 1]).toBe(49);
    }
  });

  test("кривые входные данные не роняют каталог", () => {
    expect(pageItems(0, 0)).toEqual([]);
    expect(pageItems(5, 3)).toEqual([1, 2, 3]);
    expect(pageItems(-2, 4)).toEqual([1, 2, 3, 4]);
  });

  /** Список короткий: на узком экране всё должно уместиться в одну строку. */
  test("длина списка не растёт с числом страниц", () => {
    expect(pageItems(500, 1000).length).toBeLessThanOrEqual(7);
    expect(pageItems(25, 49).length).toBeLessThanOrEqual(7);
  });
});
