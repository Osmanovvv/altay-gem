import { describe, expect, it } from 'bun:test';
import { archivalIsSafe, parseGoodsExportRow } from './import-goods';

/**
 * Маппер строки Excel-выгрузки «Управления ассортиментом» (goods_export)
 * в форму товара реплики. Колонки — как в реальной выгрузке заказчицы
 * (26 столбцов, ключи по кириллическим заголовкам).
 */

/** Типовая строка выгрузки (обычный товар, есть штрихкод). */
const baseRow = (): Record<string, unknown> => ({
  uuid: '000a290f-86a8-4b6f-9724-ef25e0e75c2d',
  Наименование: 'Пантогематоген  250 мл.',
  Артикул: '4607007040',
  'В продаже': true,
  'Подакцизный товар': false,
  Группа: 'Биостимул',
  'Код группы товаров': 'bd4bbde2-a373-4e75-9ea4-e90fb74b7399',
  'Признак группы': false,
  'Структура групп': 'Биостимул',
  'Цена закупки': 630,
  Цена: 1260,
  Остаток: 6,
  Тип: 'NORMAL',
  Описание: '',
  'Штрих-код': '4607081980038',
  НДС: 'VAT_5',
  Код: '4607007040',
  'Ед.изм.': 'шт',
});

describe('parseGoodsExportRow', () => {
  it('обычный товар: полное отображение колонок в поля реплики', () => {
    const p = parseGoodsExportRow(baseRow());
    expect(p).not.toBeNull();
    expect(p!.uuid).toBe('000a290f-86a8-4b6f-9724-ef25e0e75c2d');
    expect(p!.name).toBe('Пантогематоген  250 мл.'); // имя не нормализуем
    expect(p!.article).toBe('4607007040');
    expect(p!.code).toBe('4607007040');
    expect(p!.barcodes).toEqual(['4607081980038']);
    expect(p!.measure).toBe('шт');
    expect(p!.groupUuid).toBe('bd4bbde2-a373-4e75-9ea4-e90fb74b7399');
    expect(p!.groupName).toBe('Биостимул');
    expect(p!.priceKopecks).toBe(126000); // 1260 ₽ → копейки
    expect(p!.costPriceKopecks).toBe(63000); // 630 ₽
    expect(p!.quantity).toBe(6);
    expect(p!.evotorType).toBe('NORMAL');
    expect(p!.isMarked).toBe(false);
    expect(p!.allowToSell).toBe(true);
  });

  it('matchKey = первый штрихкод, если он есть', () => {
    expect(parseGoodsExportRow(baseRow())!.matchKey).toBe('4607081980038');
  });

  it('маркированный тип (DAIRY_MARKED) → isMarked=true', () => {
    const p = parseGoodsExportRow({ ...baseRow(), Тип: 'DAIRY_MARKED' });
    expect(p!.isMarked).toBe(true);
    expect(p!.evotorType).toBe('DAIRY_MARKED');
  });

  it('пустой штрихкод → barcodes=[], matchKey откатывается на артикул', () => {
    const p = parseGoodsExportRow({ ...baseRow(), 'Штрих-код': '' });
    expect(p!.barcodes).toEqual([]);
    expect(p!.matchKey).toBe('4607007040'); // артикул
  });

  it('без штрихкода и артикула → matchKey = нормализованное имя', () => {
    const p = parseGoodsExportRow({
      ...baseRow(),
      'Штрих-код': '',
      Артикул: '',
      Наименование: 'Пантокрин  100 МЛ',
    });
    expect(p!.matchKey).toBe('пантокрин 100 мл'); // lower + схлопнутые пробелы
  });

  it('несколько штрихкодов через разделитель → массив', () => {
    const p = parseGoodsExportRow({
      ...baseRow(),
      'Штрих-код': '4607081980038, 4610008496260',
    });
    expect(p!.barcodes).toEqual(['4607081980038', '4610008496260']);
  });

  it('«В продаже» = false → allowToSell=false (для снятия с витрины)', () => {
    const p = parseGoodsExportRow({ ...baseRow(), 'В продаже': false });
    expect(p!.allowToSell).toBe(false);
  });

  it('строковые булевы («ИСТИНА»/«ЛОЖЬ»/«TRUE») тоже понимаются', () => {
    expect(parseGoodsExportRow({ ...baseRow(), 'В продаже': 'ЛОЖЬ' })!.allowToSell).toBe(false);
    expect(parseGoodsExportRow({ ...baseRow(), 'В продаже': 'TRUE' })!.allowToSell).toBe(true);
  });

  it('пустой остаток не превращается в 0 (не затирает при частичных данных)', () => {
    const p = parseGoodsExportRow({ ...baseRow(), Остаток: '' });
    expect(p!.quantity).toBeNull();
  });

  it('невалидный uuid → null (в uuid-колонку мусор не пишем)', () => {
    expect(parseGoodsExportRow({ ...baseRow(), uuid: 'не-uuid' })).toBeNull();
    expect(parseGoodsExportRow({ ...baseRow(), uuid: '' })).toBeNull();
  });

  it('пустое наименование → null', () => {
    expect(parseGoodsExportRow({ ...baseRow(), Наименование: '' })).toBeNull();
  });

  it('строка-группа («Признак группы»=true) пропускается (null)', () => {
    expect(parseGoodsExportRow({ ...baseRow(), 'Признак группы': true })).toBeNull();
  });

  it('невалидный код группы не роняет строку — groupUuid=null, имя группы остаётся', () => {
    const p = parseGoodsExportRow({ ...baseRow(), 'Код группы товаров': 'мусор' });
    expect(p!.groupUuid).toBeNull();
    expect(p!.groupName).toBe('Биостимул');
  });

  it('raw сохраняет исходную строку целиком', () => {
    const row = baseRow();
    expect(parseGoodsExportRow(row)!.raw).toEqual(row);
  });
});

describe('archivalIsSafe', () => {
  it('первый импорт (реплика пуста) — архивировать нечего, безопасно', () => {
    expect(archivalIsSafe(1807, 0)).toBe(true);
  });
  it('полная выгрузка (≈ размер реплики) — безопасно архивировать отсутствующие', () => {
    expect(archivalIsSafe(1807, 1808)).toBe(true);
    expect(archivalIsSafe(1810, 1808)).toBe(true); // выгрузка даже больше
  });
  it('битая/крошечная выгрузка при большой реплике — НЕ архивировать (страховка)', () => {
    expect(archivalIsSafe(5, 1808)).toBe(false);
    expect(archivalIsSafe(0, 1808)).toBe(false);
  });
  it('порог — не меньше половины реплики', () => {
    expect(archivalIsSafe(900, 1808)).toBe(false); // < 50%
    expect(archivalIsSafe(1000, 1808)).toBe(true); // > 50%
  });
});
