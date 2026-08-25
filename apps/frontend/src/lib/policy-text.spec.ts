import { describe, expect, test } from "bun:test";
import { parsePolicyText } from "./policy-text";

describe("разбор текста правового документа", () => {
  test("пустой текст — ничего", () => {
    expect(parsePolicyText("")).toEqual([]);
    expect(parsePolicyText("   \n\n  ")).toEqual([]);
  });

  test("нумерованная строка капсом — заголовок раздела", () => {
    expect(parsePolicyText("1. ОБЩИЕ ПОЛОЖЕНИЯ")).toEqual([
      { kind: "heading", text: "1. ОБЩИЕ ПОЛОЖЕНИЯ" },
    ]);
  });

  test("обычный абзац остаётся абзацем", () => {
    const t = "Настоящая Политика определяет порядок обработки.";
    expect(parsePolicyText(t)).toEqual([{ kind: "paragraph", text: t }]);
  });

  test("заголовок и абзац разделяются пустой строкой", () => {
    const blocks = parsePolicyText("2. ОПЕРАТОР\n\nИП Заболоцкий А. С.");
    expect(blocks).toEqual([
      { kind: "heading", text: "2. ОПЕРАТОР" },
      { kind: "paragraph", text: "ИП Заболоцкий А. С." },
    ]);
  });

  test("переносы внутри абзаца сохраняются — это адрес или список", () => {
    const t = "г. Новосибирск, ул. Ленинградская, 75/2\nг. Новосибирск, ул. Титова, 32";
    expect(parsePolicyText(t)).toEqual([{ kind: "paragraph", text: t }]);
  });

  /**
   * Заголовком считается ТОЛЬКО одиночная строка капсом с номером. Предложение,
   * начинающееся с числа («54-ФЗ ...»), и капс внутри абзаца заголовком не
   * становятся — иначе документ развалится на куски в неожиданных местах.
   */
  test("предложение с цифры и капс в середине заголовком не становятся", () => {
    const blocks = parsePolicyText(
      "1. Оплата совершается на защищённой странице.\n\nОператор НЕ хранит данные карт.",
    );
    expect(blocks.every((b) => b.kind === "paragraph")).toBe(true);
    expect(blocks).toHaveLength(2);
  });

  test("длинная строка капсом без номера — не заголовок", () => {
    const t = "ОПЕРАТОР НЕ ПЕРЕДАЁТ ДАННЫЕ ТРЕТЬИМ ЛИЦАМ В МАРКЕТИНГОВЫХ ЦЕЛЯХ";
    expect(parsePolicyText(t)).toEqual([{ kind: "paragraph", text: t }]);
  });

  /**
   * Ключевой тест на будущее: заказчица может вставить в админку СВОЙ текст,
   * набранный без нашей договорённости о заголовках. Он обязан отрисоваться
   * читаемыми абзацами, а не пропасть и не слипнуться.
   */
  test("чужой текст без наших заголовков — просто абзацы, ничего не теряется", () => {
    const t = "Первый абзац чужого текста.\n\nВторой абзац.\n\nТретий абзац.";
    const blocks = parsePolicyText(t);
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => b.kind === "paragraph")).toBe(true);
    expect(blocks.map((b) => b.text).join(" ")).toContain("Третий абзац.");
  });

  test("лишние пустые строки не создают пустых блоков", () => {
    const blocks = parsePolicyText("Абзац один.\n\n\n\nАбзац два.");
    expect(blocks).toHaveLength(2);
  });

  test("хвостовые пробелы в блоках срезаются", () => {
    expect(parsePolicyText("  Абзац с пробелами.   ")).toEqual([
      { kind: "paragraph", text: "Абзац с пробелами." },
    ]);
  });
});
