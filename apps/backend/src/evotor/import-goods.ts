/**
 * Первичный импорт каталога из Excel-выгрузки «Управления ассортиментом»
 * Эвотора (goods_export) — этап 2, ТЗ-1, Путь B.
 *
 * Под Путём B живой API номенклатуры/остатков недоступен (право конфликтует
 * с товароучёткой заказчицы), поэтому источник первичного импорта и ночной
 * сверки — Excel-выгрузка. Это ФАЙЛ → НАША БД: к Эвотору импорт не обращается.
 *
 * Здесь — только чистый маппер строки выгрузки в форму товара реплики
 * (переиспользует helpers из parse.ts). Чтение xlsx и upsert — отдельно
 * (import-goods.service / CLI), чтобы маппер тестировался без файла и БД.
 */
import { UUID_FORM, buildMatchKey, isMarkedType, toKopecks } from './parse';

/** Товар, разобранный из строки goods_export (форма — под upsert реплики). */
export interface GoodsExportProduct {
  uuid: string;
  name: string;
  article: string | null;
  code: string | null;
  barcodes: string[];
  measure: string | null;
  groupUuid: string | null;
  groupName: string | null;
  priceKopecks: number | null;
  costPriceKopecks: number | null;
  quantity: number | null;
  evotorType: string;
  isMarked: boolean;
  allowToSell: boolean | null;
  matchKey: string;
  raw: Record<string, unknown>;
}

type Row = Record<string, unknown>;

/** Строка или null. Числа приводим к строке — артикул/код/штрихкод бывают числом. */
const str = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
};

/** Число или null. Пустая строка — «нет значения» (не 0: не затираем остаток). */
const num = (v: unknown): number | null => {
  const n =
    typeof v === 'string'
      ? v.trim() === ''
        ? null
        : Number(v.replace(',', '.'))
      : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** UUID по форме Эвотора или null (в uuid-колонки БД мусор не пишем). */
const uuidOrNull = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && UUID_FORM.test(s) ? s : null;
};

/** «В продаже»: булево (openpyxl) или строка (ИСТИНА/ЛОЖЬ/TRUE/1). */
const boolOf = (v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 'истина' || s === 'да' || s === '1' || s === 'yes')
      return true;
    if (
      s === 'false' ||
      s === 'ложь' ||
      s === 'нет' ||
      s === '0' ||
      s === 'no' ||
      s === ''
    )
      return false;
  }
  return null;
};

/** Штрих-код: одно значение или несколько через , ; пробел → массив без пустых. */
const barcodesOf = (v: unknown): string[] => {
  const s = str(v);
  if (!s) return [];
  return s
    .split(/[,;\s]+/)
    .map((b) => b.trim())
    .filter((b) => b !== '');
};

/**
 * Одна строка Excel-выгрузки goods_export → товар реплики.
 * null — строка не товар: нет валидного uuid/имени или это строка-группа.
 * Ключи — кириллические заголовки колонок выгрузки «Управления ассортиментом».
 */
export function parseGoodsExportRow(row: Row): GoodsExportProduct | null {
  if (row['Признак группы'] === true) return null; // группы в реплику не пишем
  const uuid = uuidOrNull(row['uuid']);
  const name = str(row['Наименование']);
  if (!uuid || !name) return null;

  const barcodes = barcodesOf(row['Штрих-код']);
  const article = str(row['Артикул']);
  const evotorType = str(row['Тип']) ?? 'NORMAL';

  return {
    uuid,
    name,
    article,
    code: str(row['Код']),
    barcodes,
    measure: str(row['Ед.изм.']),
    groupUuid: uuidOrNull(row['Код группы товаров']),
    groupName: str(row['Группа']),
    priceKopecks: toKopecks(row['Цена']),
    costPriceKopecks: toKopecks(row['Цена закупки']),
    quantity: num(row['Остаток']),
    evotorType,
    isMarked: isMarkedType(evotorType),
    allowToSell: boolOf(row['В продаже']),
    matchKey: buildMatchKey({ barcodes, article, name }),
    raw: row,
  };
}

/**
 * Страховка от массовой архивации из-за неполной/битой выгрузки (аналог защиты
 * от обнуления при «полной инвентаризации»). Архивировать товары, отсутствующие
 * в выгрузке, безопасно только если выгрузка достаточно полная — содержит не
 * меньше половины текущей реплики магазина. Пустая реплика (первый импорт) —
 * архивировать нечего, безопасно.
 */
export function archivalIsSafe(
  importedCount: number,
  replicaCount: number,
): boolean {
  if (replicaCount === 0) return true;
  return importedCount >= replicaCount * 0.5;
}
