/**
 * Безопасный разбор описаний товаров из Strapi на структурированные блоки.
 *
 * Поле «Полное описание» в Strapi — редактор Markdown (кнопки B, I, U, S,
 * заголовки, списки, цитаты), при этом часть карточек заполнена как обычный
 * текст с переносами строк и смайликами. Парсер переводит разметку в
 * типизированное дерево без сырого HTML (защита от XSS), а неподдержанные
 * или незакрытые конструкции оставляет обычным текстом.
 */

export type RichInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "underline"; text: string }
  | { kind: "strike"; text: string }
  | { kind: "link"; text: string; href: string };

export type RichBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; inlines: RichInline[] }
  | { kind: "paragraph"; lines: RichInline[][] }
  | { kind: "ul"; items: RichInline[][] }
  | { kind: "ol"; start: number; items: RichInline[][] }
  | { kind: "quote"; lines: RichInline[][] };

const HEADING_RE = /^(#{1,4})\s+(.+)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const UL_RE = /^\s*[-*•]\s+(.+)$/;
const OL_RE = /^\s*(\d{1,2})[.)]\s+(.+)$/;
const SAFE_URL_RE = /^https?:\/\/\S+$/i;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

function pushText(out: RichInline[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === "text") {
    last.text += text;
  } else {
    out.push({ kind: "text", text });
  }
}

/**
 * Выносит ведущие/хвостовые пробелы из обрамлённого фрагмента наружу:
 * в админке часто встречается «**Барсучий жир **— это...», где без выноса
 * пробела закрывающие звёздочки остались бы сырыми символами.
 */
function pushStyledWithTrimmedSpaces(
  out: RichInline[],
  kind: "bold" | "strike",
  inner: string,
  nextChar: string | undefined,
): void {
  const leadMatch = /^\s+/.exec(inner);
  const trailMatch = /\s+$/.exec(inner);
  const trimmed = inner.trim();
  const last = out[out.length - 1];
  const prevEndsWithSpace = last?.kind === "text" && /\s$/.test(last.text);
  if (leadMatch && last && !prevEndsWithSpace) pushText(out, " ");
  out.push({ kind, text: trimmed });
  if (trailMatch && nextChar !== undefined && !/\s/.test(nextChar)) pushText(out, " ");
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR_RE.test(ch);
}

function findSingleClosing(line: string, ch: "*" | "_", from: number): number {
  let pos = from;
  while (pos < line.length) {
    const idx = line.indexOf(ch, pos);
    if (idx === -1) return -1;
    // Пропускаем двойные маркеры вроде ** или __, чтобы не спутать их с курсивом.
    if (line[idx + 1] === ch || line[idx - 1] === ch) {
      pos = idx + 1;
      continue;
    }
    if (idx > from && !/\s/.test(line[idx - 1]) && !isWordChar(line[idx + 1])) {
      return idx;
    }
    pos = idx + 1;
  }
  return -1;
}

export function parseInlines(line: string): RichInline[] {
  const out: RichInline[] = [];
  let i = 0;

  while (i < line.length) {
    // 1. Ссылка [текст](https://...)
    if (line[i] === "[") {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(line.slice(i));
      if (m && SAFE_URL_RE.test(m[2])) {
        out.push({ kind: "link", text: m[1], href: m[2] });
        i += m[0].length;
        continue;
      }
    }

    // 2. Подчёркивание <u>текст</u> (кнопка U в Strapi)
    if (line.startsWith("<u>", i)) {
      const m = /^<u>([^<]+)<\/u>/.exec(line.slice(i));
      if (m && m[1].trim().length > 0) {
        out.push({ kind: "underline", text: m[1] });
        i += m[0].length;
        continue;
      }
    }

    // 3. Жирный **текст**
    if (line.startsWith("**", i)) {
      const closeIdx = line.indexOf("**", i + 2);
      if (closeIdx !== -1) {
        const inner = line.slice(i + 2, closeIdx);
        if (inner.trim().length > 0) {
          pushStyledWithTrimmedSpaces(out, "bold", inner, line[closeIdx + 2]);
          i = closeIdx + 2;
          continue;
        }
      }
      pushText(out, "**");
      i += 2;
      continue;
    }

    // 4. Жирный __текст__ (не внутри слова)
    if (line.startsWith("__", i)) {
      if (!isWordChar(line[i - 1])) {
        const closeIdx = line.indexOf("__", i + 2);
        if (closeIdx !== -1 && !isWordChar(line[closeIdx + 2])) {
          const inner = line.slice(i + 2, closeIdx);
          if (inner.trim().length > 0) {
            pushStyledWithTrimmedSpaces(out, "bold", inner, line[closeIdx + 2]);
            i = closeIdx + 2;
            continue;
          }
        }
      }
      pushText(out, "__");
      i += 2;
      continue;
    }

    // 5. Зачёркнутый ~~текст~~
    if (line.startsWith("~~", i)) {
      const closeIdx = line.indexOf("~~", i + 2);
      if (closeIdx !== -1) {
        const inner = line.slice(i + 2, closeIdx);
        if (inner.trim().length > 0) {
          pushStyledWithTrimmedSpaces(out, "strike", inner, line[closeIdx + 2]);
          i = closeIdx + 2;
          continue;
        }
      }
      pushText(out, "~~");
      i += 2;
      continue;
    }

    // 6. Курсив *текст* и _текст_ (не ломаем 5*40гр и foo_bar_baz)
    const ch = line[i];
    if (
      (ch === "*" || ch === "_") &&
      line[i + 1] !== ch &&
      line[i - 1] !== ch &&
      !isWordChar(line[i - 1]) &&
      i + 1 < line.length &&
      !/\s/.test(line[i + 1])
    ) {
      const closeIdx = findSingleClosing(line, ch, i + 1);
      if (closeIdx !== -1) {
        out.push({ kind: "italic", text: line.slice(i + 1, closeIdx) });
        i = closeIdx + 1;
        continue;
      }
    }

    pushText(out, line[i]);
    i += 1;
  }

  return out;
}

export function parseRichText(raw: string): RichBlock[] {
  const normalized = raw.replace(/\r\n?/g, "\n");
  if (!normalized.trim()) return [];

  const blocks: RichBlock[] = [];
  let current: Exclude<RichBlock, { kind: "heading" }> | null = null;

  const flush = () => {
    if (!current) return;
    blocks.push(current);
    current = null;
  };

  for (const line of normalized.split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      flush();
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4,
        inlines: parseInlines(headingMatch[2].trim()),
      });
      continue;
    }

    const quoteMatch = QUOTE_RE.exec(line);
    if (quoteMatch) {
      const parsed = parseInlines(quoteMatch[1]);
      if (current && current.kind === "quote") {
        current.lines.push(parsed);
      } else {
        flush();
        current = { kind: "quote", lines: [parsed] };
      }
      continue;
    }

    if (!/^\s*\*\*/.test(line)) {
      const ulMatch = UL_RE.exec(line);
      if (ulMatch) {
        const parsed = parseInlines(ulMatch[1]);
        if (current && current.kind === "ul") {
          current.items.push(parsed);
        } else {
          flush();
          current = { kind: "ul", items: [parsed] };
        }
        continue;
      }
    }

    const olMatch = OL_RE.exec(line);
    if (olMatch) {
      const parsed = parseInlines(olMatch[2]);
      if (current && current.kind === "ol") {
        current.items.push(parsed);
      } else {
        flush();
        current = { kind: "ol", start: Number(olMatch[1]), items: [parsed] };
      }
      continue;
    }

    const parsed = parseInlines(line);
    if (current && current.kind === "paragraph") {
      current.lines.push(parsed);
    } else {
      flush();
      current = { kind: "paragraph", lines: [parsed] };
    }
  }

  flush();
  return blocks;
}
