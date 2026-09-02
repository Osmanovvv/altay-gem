/*
 * Markdown -> Word (.docx) для документов заказчику: инструкция по админке,
 * политика, справки. Оформление в цветах бренда.
 *
 * Лежит В РЕПОЗИТОРИИ намеренно: раньше скрипт жил во временной папке сессии и
 * дважды пропадал вместе с ней, а документы приходилось пересобирать «на чём
 * придётся» — и они переставали быть похожими друг на друга.
 *
 * Запуск:  node tools/md2docx.js ИСХОДНИК.md РЕЗУЛЬТАТ.docx "Текст колонтитула"
 * Зависимость: npm i docx  (в каталоге, откуда запускаете)
 *
 * PDF отдельно: открыть .docx в Word и «Сохранить как PDF», либо из PowerShell
 * через COM (Word.Application → SaveAs формат 17).
 */
const fs = require('node:fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, convertInchesToTwip,
} = require('docx');

const SRC = process.argv[2];
const OUT = process.argv[3];
const HEADTEXT = process.argv[4] || 'Жемчужина Алтая';

if (!SRC || !OUT) {
  console.error('Использование: node md2docx.js ИСХОДНИК.md РЕЗУЛЬТАТ.docx "Колонтитул"');
  process.exit(1);
}

const GREEN = '1F4A30';   // фирменный тёмно-зелёный
const GOLD = 'A67C2E';    // акцент, мёд
const TEXT = '1F1A0E';
const MUTED = '5C5545';
const RULE = 'DCD6C8';
const HEAD_BG = 'F5F1E8';

const CONTENT_W = 9026;   // A4 минус поля

/**
 * Разбор строки на куски: **жирный** и `моноширинный`.
 * base идёт ПЕРВЫМ в спреде — иначе bold:undefined из base затрёт bold:true
 * (на этом уже спотыкались: жирный пропадал внутри таблиц).
 */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    const piece = m[0];
    if (piece.startsWith('**')) {
      out.push(new TextRun({ ...base, text: piece.slice(2, -2), bold: true }));
    } else {
      out.push(new TextRun({ ...base, text: piece.slice(1, -1), font: 'Consolas' }));
    }
    last = m.index + piece.length;
  }
  if (last < text.length) out.push(new TextRun({ ...base, text: text.slice(last) }));
  return out.length ? out : [new TextRun({ ...base, text: '' })];
}

const body = { size: 21, color: TEXT };

function para(text, extra = {}) {
  return new Paragraph({ children: runs(text, body), spacing: { after: 120 }, ...extra });
}

function heading(text, level) {
  const sizes = { 1: 34, 2: 27, 3: 23 };
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: { before: level === 3 ? 240 : 360, after: 140 },
    children: [new TextRun({
      text,
      bold: true,
      size: sizes[level],
      color: level === 3 ? GOLD : GREEN,
    })],
  });
}

function bullet(text) {
  return new Paragraph({
    children: runs(text, body),
    bullet: { level: 0 },
    spacing: { after: 80 },
    indent: { left: convertInchesToTwip(0.25) },
  });
}

function numbered(text) {
  // Без нумерованного списка Word: номер уже есть в тексте исходника.
  return new Paragraph({
    children: runs(text, body),
    spacing: { after: 80 },
    indent: { left: convertInchesToTwip(0.25) },
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } },
    children: [new TextRun({ text: '' })],
  });
}

/** Таблица фиксированной ширины: без неё Word и Google Docs ломают колонки. */
function table(rows) {
  const cols = rows[0].length;
  const width = Math.floor(CONTENT_W / cols);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: Array(cols).fill(width),
    rows: rows.map((cells, i) => new TableRow({
      tableHeader: i === 0,
      children: cells.map((c) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        shading: i === 0 ? { type: ShadingType.CLEAR, fill: HEAD_BG } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
          left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
          right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
        },
        children: [new Paragraph({
          children: runs(c, i === 0 ? { ...body, bold: true, color: GREEN } : body),
        })],
      })),
    })),
  });
}

const splitRow = (line) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isDelimiter = (line) => /^\|?[\s:-]+\|[\s|:-]*$/.test(line);

const raw = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n').split('\n');
const children = [];

for (let i = 0; i < raw.length; i++) {
  const line = raw[i];
  const t = line.trim();

  if (!t) continue;

  if (t === '---') { children.push(divider()); continue; }

  if (t.startsWith('### ')) { children.push(heading(t.slice(4), 3)); continue; }
  if (t.startsWith('## ')) { children.push(heading(t.slice(3), 2)); continue; }
  if (t.startsWith('# ')) { children.push(heading(t.slice(2), 1)); continue; }

  // Таблица: строка с | и следующая — разделитель
  if (t.startsWith('|') && isDelimiter((raw[i + 1] || '').trim())) {
    const rows = [splitRow(t)];
    i += 2;
    while (i < raw.length && raw[i].trim().startsWith('|')) {
      rows.push(splitRow(raw[i].trim()));
      i++;
    }
    i--;
    children.push(table(rows));
    children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun('')] }));
    continue;
  }

  if (t.startsWith('- ')) { children.push(bullet(t.slice(2))); continue; }
  if (/^\d+\.\s/.test(t)) { children.push(numbered(t)); continue; }

  // Обычный абзац: подклеиваем продолжения, чтобы перенос строки в исходнике
  // не разрывал предложение на два абзаца в Word.
  let text = t;
  while (
    i + 1 < raw.length &&
    raw[i + 1].trim() &&
    !/^(#{1,3} |[-*] |\||\d+\.\s|---$)/.test(raw[i + 1].trim())
  ) {
    text += ' ' + raw[i + 1].trim();
    i++;
  }
  children.push(para(text));
}

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Georgia', size: 21, color: TEXT } },
    },
  },
  sections: [{
    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1440, right: 1440 } } },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [new TextRun({ text: HEADTEXT, size: 17, color: MUTED })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], size: 17, color: MUTED })],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(OUT, b);
  console.log('готово:', OUT, Math.round(b.length / 1024) + ' КБ, элементов:', children.length);
});
