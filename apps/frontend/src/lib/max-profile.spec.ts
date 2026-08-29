import { describe, expect, test } from "bun:test";
import { contactPhoneDigits, prefill, profileName } from "./max-profile";

describe("имя из профиля MAX", () => {
  test("имя и фамилия склеиваются", () => {
    expect(profileName({ first_name: "Иван", last_name: "Петров" })).toBe("Иван Петров");
  });

  test("только имя — берём его", () => {
    expect(profileName({ first_name: "Иван" })).toBe("Иван");
  });

  test("только фамилия — тоже годится", () => {
    expect(profileName({ last_name: "Петров" })).toBe("Петров");
  });

  test("профиля нет или он пустой — пусто, а не «undefined»", () => {
    expect(profileName(undefined)).toBe("");
    expect(profileName({})).toBe("");
    expect(profileName({ first_name: "  ", last_name: "  " })).toBe("");
  });

  test("лишние пробелы срезаются", () => {
    expect(profileName({ first_name: "  Иван ", last_name: " Петров  " })).toBe("Иван Петров");
  });
});

describe("подстановка в поле формы", () => {
  /**
   * Главное правило: подстановка НЕ затирает то, что покупатель уже ввёл.
   * Иначе человек напишет имя, вернётся на шаг назад — и увидит чужое.
   */
  test("введённое покупателем не затирается", () => {
    expect(prefill("Мария", "Иван Петров")).toBe("Мария");
  });

  test("пустое поле заполняется из профиля", () => {
    expect(prefill("", "Иван Петров")).toBe("Иван Петров");
    expect(prefill("   ", "Иван Петров")).toBe("Иван Петров");
  });

  test("подставлять нечего — поле остаётся как было", () => {
    expect(prefill("", "")).toBe("");
    expect(prefill("Мария", "")).toBe("Мария");
  });
});

describe("телефон из окна MAX", () => {
  /**
   * Телефона в данных запуска нет — он приходит отдельно, после согласия
   * покупателя, и в неизвестном формате. Приводим к 10 значащим цифрам, с
   * которыми работает маска формы.
   */
  test("разные форматы приводятся к десяти цифрам", () => {
    expect(contactPhoneDigits("+7 913 000-11-22")).toBe("9130001122");
    expect(contactPhoneDigits("89130001122")).toBe("9130001122");
    expect(contactPhoneDigits("79130001122")).toBe("9130001122");
    expect(contactPhoneDigits("+79130001122")).toBe("9130001122");
  });

  test("мусор и пустота дают пусто, а не кривой номер", () => {
    expect(contactPhoneDigits("")).toBe("");
    expect(contactPhoneDigits("не телефон")).toBe("");
    expect(contactPhoneDigits("+7 913 000")).toBe("");
  });

  /** Иностранный номер маска не поддерживает — лучше пусто, чем мусор в заказе. */
  test("не российский номер отбрасывается", () => {
    expect(contactPhoneDigits("+1 234 567 8901")).toBe("");
  });
});
