import { describe, expect, test } from "bun:test";
import { entranceInitial } from "./entrance";

describe("появление карточек", () => {
  /**
   * Ради этого всё и написано. framer-motion сериализует initial прямо в
   * SSR-разметку, и сервер отдавал /catalog с двадцатью четырьмя элементами
   * в opacity:0 — готовая страница приезжала НЕВИДИМОЙ и проявлялась только
   * после ~150 КБ JS. На телефоне это читалось как «карточки дёргаются».
   * На первой отрисовке анимации быть не должно.
   */
  test("до гидратации анимации нет — разметка видна сразу", () => {
    expect(entranceInitial(false, 16)).toBe(false);
  });

  test("после гидратации анимация возвращается", () => {
    expect(entranceInitial(true, 16)).toEqual({ opacity: 0, y: 16 });
    expect(entranceInitial(true, 12)).toEqual({ opacity: 0, y: 12 });
  });
});
