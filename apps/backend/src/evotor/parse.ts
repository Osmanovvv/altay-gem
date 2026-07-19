/**
 * Чистые функции разбора вебхуков Эвотора (этап 2, ТЗ р.10).
 *
 * Осторожность по контракту: push-эндпоинты Эвотора используют camelCase
 * (storeUuid, productUuid, barCodes), REST-чтение — snake_case (store_id,
 * product_id, barcodes), а точный ключ контейнера позиций чека в живом
 * push-е не задокументирован однозначно (positions | positionsList).
 * Поэтому парсер принимает ОБА варианта — правильнее принять и обработать,
 * чем уронить ретраи на 72 часа.
 */

/** Документ-чек, приведённый к внутреннему виду. */
export interface ParsedReceipt {
  uuid: string;
  /** SELL — продажа, PAYBACK — возврат; BUY/BUYBACK — закупки (игнорируем). */
  type: string;
  storeId: string | null;
  positions: Array<{ productId: string; quantity: number }>;
}

/** Товар из push-а номенклатуры, приведённый к внутреннему виду. */
export interface ParsedProduct {
  uuid: string;
  name: string;
  group: boolean;
  parentUuid: string | null;
  priceKopecks: number | null;
  costPriceKopecks: number | null;
  quantity: number | null;
  barcodes: string[];
  article: string | null;
  code: string | null;
  measure: string | null;
  evotorType: string;
  isMarked: boolean;
  allowToSell: boolean | null;
  /** Признак удаления/архивации, если источник его прислал (не гарантирован). */
  removed: boolean;
  raw: Record<string, unknown>;
}

type Dict = Record<string, unknown>;

const asDict = (v: unknown): Dict =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : {};

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

/**
 * UUID по форме (hex 8-4-4-4-12) БЕЗ проверки version/variant — у
 * идентификаторов Эвотора нестандартные биты (напр. 20180820-7052-...).
 */
export const UUID_FORM = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Строка-UUID или null: значения уходят в uuid-колонки БД — мусор режем здесь. */
const uuidStr = (v: unknown): string | null => {
  const s = str(v);
  return s && UUID_FORM.test(s) ? s : null;
};

const num = (v: unknown): number | null => {
  // Пустая строка — «нет значения», а не 0 (Number('') === 0 затёр бы остаток).
  const n =
    typeof v === 'string' ? (v.trim() === '' ? null : Number(v)) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Рубли (float Эвотора) → копейки; null для отсутствующих значений. */
export function toKopecks(price: unknown): number | null {
  const n = num(price);
  return n === null ? null : Math.round(n * 100);
}

/** Нормализация имени для match_key: нижний регистр, ё→е, схлопнутые пробелы. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Ключ матчинга «одинаковых» товаров двух магазинов (см. схему БД):
 * первый штрихкод → артикул → нормализованное имя.
 */
export function buildMatchKey(p: {
  barcodes: string[];
  article: string | null;
  name: string;
}): string {
  return p.barcodes[0] ?? p.article ?? normalizeName(p.name);
}

/** Маркированный тип («Честный знак»): *_MARKED, но не *_NOT_MARKED. */
export function isMarkedType(evotorType: string): boolean {
  return evotorType.includes('MARKED') && !evotorType.includes('NOT_MARKED');
}

/**
 * Знак влияния типа документа на остаток реплики (этап 2, Шаг 3).
 * Проверено по definitions.yaml Эвотора + гайду синхронизации (2026-07-13):
 * количество в позиции ВСЕГДА положительное, направление задаёт ТИП.
 *   SELL / WRITE_OFF / RETURN → −1 (товар уходит: продажа / списание / возврат ПОСТАВЩИКУ)
 *   PAYBACK / ACCEPT          → +1 (товар приходит: возврат ПОКУПАТЕЛЯ / приёмка)
 * Прочее → 0 (дельтой к остатку НЕ применяем):
 *   INVENTORY — абсолютный пересчёт (замена), обрабатывается отдельной веткой;
 *   REVALUATION — меняет цену, а не остаток;
 *   BUY / BUYBACK / CORRECTION — источники расходятся, до проверки на реальном
 *   payload не применяем; неизвестные типы — тоже 0 (не падаем, отдаём на сверку).
 * ВНИМАНИЕ: PAYBACK (возврат покупателя, +1) и RETURN (возврат поставщику, −1) —
 * два РАЗНЫХ «возврата» с противоположным знаком, критично не перепутать.
 */
export function documentStockSign(type: string): -1 | 0 | 1 {
  switch (type) {
    case 'SELL':
    case 'WRITE_OFF':
    case 'RETURN':
      return -1;
    case 'PAYBACK':
    case 'ACCEPT':
      return 1;
    default:
      return 0;
  }
}

/**
 * Проверка, что push действительно от Эвотора: заголовок Authorization
 * равен токену, заданному в кабинете (Bearer или «голое» значение).
 * HMAC-подписи у Эвотора нет — только статический секрет поверх HTTPS.
 */
export function pushAuthorized(
  header: string | undefined,
  secret: string,
): boolean {
  if (!secret || !header) return false;
  return header === secret || header === `Bearer ${secret}`;
}

/**
 * Разбор документа-чека из push-а Эвотора. null — тело не похоже на чек.
 * Принимает обе формы: старый PUT-документ (uuid/storeUuid + positions|
 * positionsList) и «Чеки ver.2» (id/storeId + items, поля бывают внутри
 * элемента data). Ключ товара в items — id.
 */
export function parseReceipt(body: unknown): ParsedReceipt | null {
  const d = asDict(body);
  const data = asDict(d.data); // ver.2: настоящий документ живёт в receipt.data
  // Реальный вебхук «Чеки ver.2» — КОНВЕРТ: наверху id и type СОБЫТИЯ
  // ("ReceiptCreated"), а сам фискальный документ (его id и тип SELL/PAYBACK) —
  // в data. Берём документ: иначе (а) documentStockSign(конверт)=0 и остаток не
  // спишется, (б) дедуп разъедется со страховочным поллингом (getDocuments
  // вернёт документ по ЕГО id = data.id, а не по id события).
  const uuid = str(d.uuid) ?? str(data.id) ?? str(d.id);
  const type = str(data.type) ?? str(d.type);
  if (!uuid || !type) return null;

  const inner = asDict(d.body);
  // Только валидные по форме UUID: значения идут в uuid-колонки, и кривой id
  // не должен ронять всю транзакцию чека («invalid input syntax for uuid»).
  const storeId =
    uuidStr(d.storeUuid) ??
    uuidStr(d.store_id) ??
    uuidStr(d.storeId) ??
    uuidStr(data.storeId) ??
    // storeUuid бывает и внутри body (как и позиции) — иначе движение осталось
    // бы без магазина и не применилось к остатку (ТЗ п.2/3).
    uuidStr(inner.storeUuid) ??
    uuidStr(inner.store_id) ??
    uuidStr(inner.storeId) ??
    null;

  const rawPositions = [
    d.positions,
    inner.positions,
    data.items,
    d.items,
    d.positionsList,
    inner.positionsList,
  ].find(Array.isArray) as unknown[] | undefined;

  const positions: ParsedReceipt['positions'] = [];
  for (const rp of rawPositions ?? []) {
    const p = asDict(rp);
    const productId =
      uuidStr(p.product_id) ??
      uuidStr(p.productUuid) ??
      uuidStr(p.productId) ??
      uuidStr(p.commodityUuid) ??
      uuidStr(p.uuid) ??
      uuidStr(p.id); // ver.2: у элемента items ключ id
    const quantity = num(p.quantity);
    // Эвотор шлёт ЗНАКОВОЕ количество: SELL — положительное, PAYBACK —
    // ОТРИЦАТЕЛЬНОЕ (подтверждено живым возвратом с прода 15.07: quantity
    // −0.834). Берём МОДУЛЬ; направление задаёт documentStockSign(type).
    // Раньше фильтр quantity>0 отбрасывал возвраты → остаток не восстанавливался.
    // Ноль (нет движения) и мусор (num→null) по-прежнему отбрасываем.
    if (productId && quantity !== null && quantity !== 0)
      positions.push({ productId, quantity: Math.abs(quantity) });
  }

  return { uuid, type, storeId, positions };
}

/** Разбор одного товара из push-а номенклатуры. null — нет uuid/имени. */
export function parseProductPush(item: unknown): ParsedProduct | null {
  const p = asDict(item);
  const uuid = uuidStr(p.uuid) ?? uuidStr(p.id);
  const name = str(p.name);
  if (!uuid || !name) return null;

  const barcodesRaw = (
    Array.isArray(p.barCodes)
      ? p.barCodes
      : Array.isArray(p.barcodes)
        ? p.barcodes
        : []
  ) as unknown[];
  const barcodes = barcodesRaw.filter(
    (b): b is string => typeof b === 'string' && b.trim() !== '',
  );

  const article = str(p.articleNumber) ?? str(p.article_number) ?? null;
  const evotorType = str(p.type) ?? 'NORMAL';

  return {
    uuid,
    name,
    group: p.group === true,
    parentUuid: uuidStr(p.parentUuid) ?? uuidStr(p.parent_id) ?? null,
    priceKopecks: toKopecks(p.price),
    costPriceKopecks: toKopecks(p.costPrice ?? p.cost_price),
    quantity: num(p.quantity),
    barcodes,
    article,
    code: str(p.code),
    measure: str(p.measureName) ?? str(p.measure_name) ?? null,
    evotorType,
    isMarked: isMarkedType(evotorType),
    allowToSell:
      typeof p.allowToSell === 'boolean'
        ? p.allowToSell
        : typeof p.allow_to_sell === 'boolean'
          ? p.allow_to_sell
          : null,
    removed: p.isRemoved === true || p.removed === true || p.deleted === true,
    raw: p,
  };
}
