import type { EvotorApiProduct } from './evotor-api.service';

/**
 * Товар из Облака Эвотора → строка в формате выгрузки товароучётки.
 *
 * Зачем через формат файла. Применение выгрузки (парсинг, матчинг магазинов,
 * охрана остатка по stock_asof, архивация отсутствующих, страховка от неполного
 * источника) уже написано, покрыто тестами и обкатано на проде. Второй путь
 * применения означал бы вторые баги в денежном месте. Поэтому облачный товар
 * приводится к ТЕМ ЖЕ колонкам, и дальше всё идёт по проверенной дороге:
 * parseGoodsExportRow → reconcileStore.
 *
 * Соответствие полей (Cloud API V2, snake_case → колонки xlsx):
 *   id              → uuid                    quantity      → Остаток
 *   name            → Наименование            price         → Цена
 *   article_number  → Артикул                 cost_price    → Цена закупки
 *   code            → Код                     measure_name  → Ед.изм.
 *   barcodes[]      → Штрих-код               type          → Тип
 *   parent_id       → Код группы товаров      allow_to_sell → В продаже
 *   group           → Признак группы
 *
 * Чего в облаке НЕТ по сравнению с файлом: имени группы (только id) — в реплике
 * останется прежнее, поле не затирается пустым (см. reconcileStore).
 */
export function cloudProductToRow(
  p: Partial<EvotorApiProduct> & Record<string, unknown>,
): Record<string, unknown> {
  return {
    uuid: p.id,
    Наименование: p.name,
    Артикул: p.article_number,
    Код: p.code,
    // Парсер принимает и массив, и строку с разделителями — отдаём как есть.
    'Штрих-код': p.barcodes,
    'Ед.изм.': p.measure_name,
    'Код группы товаров': p.parent_id,
    Цена: p.price,
    'Цена закупки': p.cost_price,
    Остаток: p.quantity,
    Тип: p.type,
    'В продаже': p.allow_to_sell,
    // Группы (папки) в реплику не пишем — парсер отсеет по этому признаку.
    'Признак группы': p.group === true,
    // Исходный товар целиком: пригодится для отладки и полей, которых ещё нет
    // в формате файла (модификации, ставки НДС, коды алкоголя).
    raw_cloud: p,
  };
}

/**
 * Момент, которым помечается снимок из облака: начало чтения минус запас на
 * отставание облака (см. cloud-goods.spec). Запас никогда не сдвигает метку
 * вперёд — иначе снимок получил бы власть над более свежими чеками.
 */
export function cloudSnapshotAt(fetchStartMs: number, lagMinutes: number): number {
  return fetchStartMs - Math.max(0, lagMinutes) * 60_000;
}
