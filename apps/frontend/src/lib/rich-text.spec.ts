import { describe, expect, test } from "bun:test";
import { parseInlines, parseRichText } from "./rich-text";

describe("разбор описаний товаров (parseRichText / parseInlines)", () => {
  test("пустой ввод возвращает пустой список", () => {
    expect(parseRichText("")).toEqual([]);
    expect(parseRichText("   \r\n\r\n  ")).toEqual([]);
  });

  test("пример заказчицы («Горный мёд»): одиночные переносы, список и смайлик сохраняются", () => {
    const sample = [
      "Цвет — от светло-янтарного до глубокого янтарного, вкус насыщенный.",
      "Польза",
      "1. Иммунитет и тонус — общеукрепляющее действие.",
      "2. Природный источник энергии — фруктоза и глюкоза.",
      "3. Горло и дыхание — при кашле и ангине.",
      "4. Сердце и сосуды — флавоноиды.",
      "⚠️ Важно: мёд — продукт питания, а не лекарство.",
      "Не греть выше 40 °C — в кипяток не добавлять.",
    ].join("\r\n");

    const blocks = parseRichText(sample);
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        lines: [
          [
            {
              kind: "text",
              text: "Цвет — от светло-янтарного до глубокого янтарного, вкус насыщенный.",
            },
          ],
          [{ kind: "text", text: "Польза" }],
        ],
      },
      {
        kind: "ol",
        start: 1,
        items: [
          [{ kind: "text", text: "Иммунитет и тонус — общеукрепляющее действие." }],
          [{ kind: "text", text: "Природный источник энергии — фруктоза и глюкоза." }],
          [{ kind: "text", text: "Горло и дыхание — при кашле и ангине." }],
          [{ kind: "text", text: "Сердце и сосуды — флавоноиды." }],
        ],
      },
      {
        kind: "paragraph",
        lines: [
          [{ kind: "text", text: "⚠️ Важно: мёд — продукт питания, а не лекарство." }],
          [{ kind: "text", text: "Не греть выше 40 °C — в кипяток не добавлять." }],
        ],
      },
    ]);
  });

  test("маркированные списки (-, *, •) и нумерованные списки со скобкой и смещённым стартом", () => {
    const md = [
      "- первый пункт",
      "* второй пункт",
      "• третий пункт",
      "",
      "3) третий шаг",
      "4) четвёртый шаг",
    ].join("\n");

    expect(parseRichText(md)).toEqual([
      {
        kind: "ul",
        items: [
          [{ kind: "text", text: "первый пункт" }],
          [{ kind: "text", text: "второй пункт" }],
          [{ kind: "text", text: "третий пункт" }],
        ],
      },
      {
        kind: "ol",
        start: 3,
        items: [[{ kind: "text", text: "третий шаг" }], [{ kind: "text", text: "четвёртый шаг" }]],
      },
    ]);
  });

  test("строка, начинающаяся с **жирного**, не путается со списком *", () => {
    expect(parseRichText("**БАД. Не является лекарственным средством.**")).toEqual([
      {
        kind: "paragraph",
        lines: [[{ kind: "bold", text: "БАД. Не является лекарственным средством." }]],
      },
    ]);
  });

  test("пробел перед закрывающими звёздочками выносится наружу (реальные данные прода)", () => {
    expect(parseInlines("**Барсучий жир **— это натуральный продукт.")).toEqual([
      { kind: "bold", text: "Барсучий жир" },
      { kind: "text", text: " — это натуральный продукт." },
    ]);
    expect(parseInlines("Состав: ** алтайский мёд ** 100%")).toEqual([
      { kind: "text", text: "Состав: " },
      { kind: "bold", text: "алтайский мёд" },
      { kind: "text", text: " 100%" },
    ]);
    expect(parseInlines("Состав:** алтайский мёд **100%")).toEqual([
      { kind: "text", text: "Состав: " },
      { kind: "bold", text: "алтайский мёд" },
      { kind: "text", text: " 100%" },
    ]);
  });

  test("заголовки, цитаты и все строчные стили (жирный, курсив, подчёркнутый, зачёркнутый, ссылка)", () => {
    const md = [
      "## Способ применения",
      "",
      "> Хранить в прохладном месте.",
      "> Беречь от солнца.",
      "",
      "Принимать **утром**, __вечером__, *по желанию*, _курсом_, ~~не более~~, <u>строго</u> по [инструкции](https://ecomarket-altai.ru/delivery).",
    ].join("\n");

    expect(parseRichText(md)).toEqual([
      {
        kind: "heading",
        level: 2,
        inlines: [{ kind: "text", text: "Способ применения" }],
      },
      {
        kind: "quote",
        lines: [
          [{ kind: "text", text: "Хранить в прохладном месте." }],
          [{ kind: "text", text: "Беречь от солнца." }],
        ],
      },
      {
        kind: "paragraph",
        lines: [
          [
            { kind: "text", text: "Принимать " },
            { kind: "bold", text: "утром" },
            { kind: "text", text: ", " },
            { kind: "bold", text: "вечером" },
            { kind: "text", text: ", " },
            { kind: "italic", text: "по желанию" },
            { kind: "text", text: ", " },
            { kind: "italic", text: "курсом" },
            { kind: "text", text: ", " },
            { kind: "strike", text: "не более" },
            { kind: "text", text: ", " },
            { kind: "underline", text: "строго" },
            { kind: "text", text: " по " },
            { kind: "link", text: "инструкции", href: "https://ecomarket-altai.ru/delivery" },
            { kind: "text", text: "." },
          ],
        ],
      },
    ]);
  });

  test("защита: размеры 5*40гр, подчёркивания внутри слов, незакрытые маркеры и XSS остаются текстом", () => {
    expect(parseInlines("Упаковка 5*40гр и 2*100мл")).toEqual([
      { kind: "text", text: "Упаковка 5*40гр и 2*100мл" },
    ]);
    expect(parseInlines("Код foo_bar_baz без форматирования")).toEqual([
      { kind: "text", text: "Код foo_bar_baz без форматирования" },
    ]);
    expect(
      parseInlines("Опасная [ссылка](javascript:alert(1)) и <script>alert(1)</script>"),
    ).toEqual([
      { kind: "text", text: "Опасная [ссылка](javascript:alert(1)) и <script>alert(1)</script>" },
    ]);
    expect(parseInlines("Незакрытый **текст без пары")).toEqual([
      { kind: "text", text: "Незакрытый **текст без пары" },
    ]);
  });
});
