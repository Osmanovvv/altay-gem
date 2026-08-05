/**
 * Чек-как-сверка (этап 2, Путь B): расчёт записи остатка по позиции документа.
 *
 * REST-документы Эвотора несут initial_quantity — остаток ДО операции по
 * данным самого Эвотора (живой прогон 04.08.2026: 84/84 позиций SELL).
 * Тогда initial ± qty — АВТОРИТЕТНЫЙ остаток на момент документа: каждая
 * продажа выравнивает накопленный дрейф реплики (приёмки/списания/
 * инвентаризации в товароучётке, которые к нам не приходят) без файла
 * выгрузки. Вебхук ver.2 initial_quantity не шлёт — для него остаётся
 * дельта, абсолют доносит страховочный поллинг тех же документов.
 *
 * Порядок охраняет stock_asof в БД (см. evotor.service) — метка последнего
 * учтённого движения: абсолют пишется, только если он не старее её, иначе
 * стёр бы более свежие продажи. Дельты применяются безусловно (коммутативны)
 * и лишь двигают метку вперёд.
 */

/** Что писать в остаток по позиции: абсолют (initial ± qty) или дельту. */
export type StockWrite =
  | { kind: 'absolute'; after: number; asofMs: number }
  | { kind: 'delta'; delta: number };

/**
 * Абсолют возможен, только когда есть И initial_quantity, И время документа:
 * абсолют без порядка опасен — снимок неизвестной давности мог бы откатить
 * более свежие движения. Иначе — дельта со знаком типа документа (как раньше).
 */
export function planStockWrite(
  pos: { quantity: number; initialQuantity: number | null },
  sign: 1 | -1,
  docTimeMs: number | null,
): StockWrite {
  if (pos.initialQuantity !== null && docTimeMs !== null) {
    return {
      kind: 'absolute',
      after: pos.initialQuantity + sign * pos.quantity,
      asofMs: docTimeMs,
    };
  }
  return { kind: 'delta', delta: sign * pos.quantity };
}
