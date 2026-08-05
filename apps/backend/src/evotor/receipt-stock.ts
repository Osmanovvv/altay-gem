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

/** Позиция документа в терминах остатка. */
interface DocPosition {
  productId: string;
  quantity: number;
  initialQuantity: number | null;
}

/**
 * План записи остатка по ВСЕМУ документу: одна запись на товар, порядок —
 * по productId (канонический порядок захвата блокировок, см. handleReceipt).
 *
 * Почему нельзя писать позиции поодиночке. Один товар встречается в чеке
 * несколько раз (маркировка требует отдельной позиции на единицу; весовой
 * товар взвешивают дважды) — на проде это 5 документов из 142 за 72 часа.
 * initial_quantity при этом ПОЗИЦИОННЫЙ: живой чек даёт 51, 50, 49, 48, 47
 * для пяти единиц. Последовательная перезапись даёт верный итог только пока
 * позиции идут в исходном порядке; порядок Эвотором не гарантирован.
 *
 * Считаем от КРАЙНЕЙ позиции: при списании (sign −1) остаток убывает, значит
 * до документа он был максимальным из initial; при возврате — минимальным.
 * Дальше прибавляем сумму количеств со знаком. Результат не зависит от
 * порядка позиций. Если хоть у одной позиции товара initial нет — весь товар
 * уходит на дельту (смешивать снимок и дельту в одном документе нельзя).
 */
export function planDocumentWrites(
  positions: DocPosition[],
  sign: 1 | -1,
  docTimeMs: number | null,
  allowAbsolute: boolean,
): Array<{ productId: string; write: StockWrite }> {
  const byProduct = new Map<
    string,
    { qty: number; initials: Array<number | null> }
  >();
  for (const p of positions) {
    const g = byProduct.get(p.productId) ?? { qty: 0, initials: [] };
    g.qty += p.quantity;
    g.initials.push(p.initialQuantity);
    byProduct.set(p.productId, g);
  }

  return [...byProduct.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([productId, g]) => {
      const known = g.initials.filter((v): v is number => v !== null);
      const complete = known.length === g.initials.length && known.length > 0;
      if (!allowAbsolute || !complete || docTimeMs === null) {
        return {
          productId,
          write: { kind: 'delta', delta: sign * g.qty } as StockWrite,
        };
      }
      // Остаток ДО документа = крайний initial по направлению движения.
      const base = sign === -1 ? Math.max(...known) : Math.min(...known);
      return {
        productId,
        write: {
          kind: 'absolute',
          after: base + sign * g.qty,
          asofMs: docTimeMs,
        } as StockWrite,
      };
    });
}
