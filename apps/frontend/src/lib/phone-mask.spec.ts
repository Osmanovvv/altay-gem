import { describe, expect, test } from "bun:test";
import {
  caretAfterDigit,
  formatPhoneDigits,
  phoneDigits,
  significantDigitsBeforeCaret,
} from "./phone-mask";

describe("phoneDigits (значащие цифры без кода страны)", () => {
  test("из маски достаёт 10 цифр", () => {
    expect(phoneDigits("+7 (999) 123-45-67")).toBe("9991234567");
  });
  test("лидирующие 8/7 отбрасываются как код страны", () => {
    expect(phoneDigits("89991234567")).toBe("9991234567");
    expect(phoneDigits("79991234567")).toBe("9991234567");
  });
  test("без кода страны — как есть, обрезка до 10", () => {
    expect(phoneDigits("9991234567999")).toBe("9991234567");
    expect(phoneDigits("999")).toBe("999");
  });
  test("мусор и пусто", () => {
    expect(phoneDigits("abc")).toBe("");
    expect(phoneDigits("")).toBe("");
  });
});

describe("formatPhoneDigits (формат как на витрине сейчас)", () => {
  test("прогрессия при наборе", () => {
    expect(formatPhoneDigits("")).toBe("");
    expect(formatPhoneDigits("9")).toBe("+7 (9");
    expect(formatPhoneDigits("99")).toBe("+7 (99");
    expect(formatPhoneDigits("999")).toBe("+7 (999) ");
    expect(formatPhoneDigits("9991")).toBe("+7 (999) 1");
    expect(formatPhoneDigits("999123")).toBe("+7 (999) 123-");
    expect(formatPhoneDigits("9991234")).toBe("+7 (999) 123-4");
    expect(formatPhoneDigits("99912345")).toBe("+7 (999) 123-45-");
    expect(formatPhoneDigits("9991234567")).toBe("+7 (999) 123-45-67");
  });
});

describe("significantDigitsBeforeCaret", () => {
  const v = "+7 (999) 123-45-67";
  test("курсор в конце — все 10", () => {
    expect(significantDigitsBeforeCaret(v, v.length)).toBe(10);
  });
  test("курсор после «)» — 3 (код страны не считается)", () => {
    expect(significantDigitsBeforeCaret(v, 8)).toBe(3);
  });
  test("курсор в начале/внутри префикса — 0", () => {
    expect(significantDigitsBeforeCaret(v, 0)).toBe(0);
    expect(significantDigitsBeforeCaret(v, 2)).toBe(0);
  });
  test("сырой ввод с 8: смещение кода страны учтено", () => {
    expect(significantDigitsBeforeCaret("8999123", 4)).toBe(3);
  });
});

describe("caretAfterDigit (позиция курсора после N-й значащей цифры)", () => {
  const f = "+7 (999) 123-45-67";
  test("после 3-й цифры — сразу за «999»", () => {
    expect(caretAfterDigit(f, 3)).toBe(7);
  });
  test("после 10-й — конец строки", () => {
    expect(caretAfterDigit(f, 10)).toBe(f.length);
  });
  test("0 цифр — перед первой цифрой (за «+7 (»)", () => {
    expect(caretAfterDigit(f, 0)).toBe(4);
    expect(caretAfterDigit("", 0)).toBe(0);
  });
  test("N больше имеющихся — конец строки", () => {
    expect(caretAfterDigit("+7 (99", 5)).toBe(6);
  });
});
