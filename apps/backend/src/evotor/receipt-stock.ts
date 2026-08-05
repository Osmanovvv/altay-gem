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
 * Типы документов, для которых трактовка initial_quantity подтверждена на
 * ЖИВЫХ данных прода (04.08.2026): SELL — 287/287 позиций за 72 ч, PAYBACK —
 * 24/24 за 60 дней. Прочих движений у клиента на кассе не бывает вовсе
 * (ACCEPT/WRITE_OFF/RETURN/INVENTORY/REVALUATION за 60 дней — ноль: всё
 * делается в товароучётке). Непроверенный тип в абсолютную запись остатка
 * не пускаем — он остаётся на прежней дельте.
 */
const ABSOLUTE_TYPES = new Set(['SELL', 'PAYBACK']);

/** Можно ли для этого типа документа писать АБСОЛЮТНЫЙ остаток. */
export function absoluteAllowed(type: string): boolean {
  return ABSOLUTE_TYPES.has(type);
}

/**
 * Абсолют возможен, только когда есть И initial_quantity, И время документа,
 * И проверенный тип: абсолют без порядка опасен — снимок неизвестной давности
 * мог бы откатить более свежие движения. Иначе — дельта со знаком типа
 * документа (как раньше).
 */
export function planStockWrite(
  pos: { quantity: number; initialQuantity: number | null },
  sign: 1 | -1,
  docTimeMs: number | null,
  allowAbsolute: boolean,
): StockWrite {
  if (allowAbsolute && pos.initialQuantity !== null && docTimeMs !== null) {
    return {
      kind: 'absolute',
      after: pos.initialQuantity + sign * pos.quantity,
      asofMs: docTimeMs,
    };
  }
  return { kind: 'delta', delta: sign * pos.quantity };
}
