import { describe, expect, test } from "bun:test";

import { formatPhoneDigits, phoneKeyAction } from "./phone-mask";

/**
 * Backspace/Delete в поле телефона: разделители «)», «-», пробел не должны
 * «держать» курсор. В мини-аппе MAX номер форматировался одним onChange, и
 * Backspace с конца залипал на хвостовом «-»: стёртый разделитель тут же
 * возвращался форматированием (найдено 16.10.2026).
 */
describe("клавиши удаления в маске телефона", () => {
  test("курсор в конце за «-» — стирается последняя цифра, а не залипает", () => {
    const v = formatPhoneDigits("91312345");
    expect(v).toBe("+7 (913) 123-45-");
    expect(phoneKeyAction(v, v.length, v.length, "Backspace")).toEqual({
      kind: "set",
      digits: "9131234",
      caretDigits: 7,
    });
  });

  test("слева обычная цифра — удаляет браузер сам", () => {
    const v = "+7 (913) 123-45-6";
    expect(phoneKeyAction(v, v.length, v.length, "Backspace")).toEqual({ kind: "native" });
  });

  test("слева «) » — стирается цифра перед скобкой", () => {
    expect(phoneKeyAction("+7 (913) 1", 9, 9, "Backspace")).toEqual({
      kind: "set",
      digits: "911",
      caretDigits: 2,
    });
  });

  test("пустая заготовка «+7 (» стирается целиком", () => {
    expect(phoneKeyAction("+7 (", 4, 4, "Backspace")).toEqual({ kind: "clear" });
  });

  test("курсор сразу за «+7 (» при набранном номере — ничего не стираем", () => {
    expect(phoneKeyAction("+7 (913) 123", 4, 4, "Backspace")).toEqual({ kind: "noop" });
  });

  test("Delete перед разделителем стирает цифру за ним", () => {
    expect(phoneKeyAction("+7 (913) 123-45-67", 12, 12, "Delete")).toEqual({
      kind: "set",
      digits: "913123567",
      caretDigits: 6,
    });
  });

  test("Delete в конце номера — справа удалять нечего, решает браузер", () => {
    const v = "+7 (913) 123-45-";
    expect(phoneKeyAction(v, v.length, v.length, "Delete")).toEqual({ kind: "native" });
  });

  test("выделение и прочие клавиши — браузер, onChange доформатирует", () => {
    expect(phoneKeyAction("+7 (913) 123", 4, 8, "Backspace")).toEqual({ kind: "native" });
    expect(phoneKeyAction("+7 (913)", 8, 8, "a")).toEqual({ kind: "native" });
  });
});
