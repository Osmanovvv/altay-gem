import { describe, expect, it } from 'bun:test';
import {
  absoluteAllowed,
  planDocumentWrites,
  planStockWrite,
} from './receipt-stock';

/**
 * Дубли товара в одном чеке — РЕАЛЬНОСТЬ прода (04.08.2026: 5 документов из
 * 142 за 72 ч). И initial_quantity там ПОЗИЦИОННЫЙ, убывающий по ходу чека:
 * живой пример — пять единиц одного товара (1, 51) (1, 50) (1, 49) (1, 48)
 * (1, 47), т.е. каждая позиция видит остаток перед СОБОЙ, а не перед
 * документом. Позиционная запись «последняя побеждает» даёт верный итог
 * лишь пока позиции идут в исходном порядке — опираться на это нельзя.
 * Считаем от крайней позиции и суммы количеств: результат не зависит от
 * порядка, а на товар приходится ровно одна запись остатка.
 */
describe('planDocumentWrites', () => {
  const T = Date.parse('2026-08-04T10:15:49.000Z');
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const B = 'bbbbbbbb-0000-4000-8000-000000000002';

  it('ЖИВОЙ чек: 5 единиц одного товара 51→47 → одна запись, остаток 46', () => {
    const pos = [51, 50, 49, 48, 47].map((iq) => ({
      productId: A,
      quantity: 1,
      initialQuantity: iq,
    }));
    expect(planDocumentWrites(pos, -1, T, true)).toEqual([
      { productId: A, write: { kind: 'absolute', after: 46, asofMs: T } },
    ]);
  });

  it('тот же чек в перемешанном порядке даёт тот же остаток', () => {
    const pos = [48, 51, 47, 50, 49].map((iq) => ({
      productId: A,
      quantity: 1,
      initialQuantity: iq,
    }));
    expect(planDocumentWrites(pos, -1, T, true)).toEqual([
      { productId: A, write: { kind: 'absolute', after: 46, asofMs: T } },
    ]);
  });

  it('ЖИВОЙ весовой дубль: 2.17−0.236−0.548 = 1.386', () => {
    const w = planDocumentWrites(
      [
        { productId: A, quantity: 0.236, initialQuantity: 2.17 },
        { productId: A, quantity: 0.548, initialQuantity: 1.934 },
      ],
      -1,
      T,
      true,
    );
    expect(w).toHaveLength(1);
    const write = w[0].write;
    expect(write.kind).toBe('absolute');
    if (write.kind === 'absolute') expect(write.after).toBeCloseTo(1.386, 9);
  });

  it('PAYBACK: остаток растёт → отсчёт от МЕНЬШЕГО initial, after = min + Σqty', () => {
    expect(
      planDocumentWrites(
        [
          { productId: A, quantity: 1, initialQuantity: 3 }, // до первой единицы
          { productId: A, quantity: 1, initialQuantity: 4 }, // до второй
        ],
        1,
        T,
        true,
      ),
    ).toEqual([
      { productId: A, write: { kind: 'absolute', after: 5, asofMs: T } },
    ]);
  });

  it('разные товары: по одной записи на товар, порядок по productId (против дедлоков)', () => {
    expect(
      planDocumentWrites(
        [
          { productId: B, quantity: 2, initialQuantity: 10 },
          { productId: A, quantity: 1, initialQuantity: 4 },
        ],
        -1,
        T,
        true,
      ),
    ).toEqual([
      { productId: A, write: { kind: 'absolute', after: 3, asofMs: T } },
      { productId: B, write: { kind: 'absolute', after: 8, asofMs: T } },
    ]);
  });

  it('среди дублей есть позиция без initial → весь товар уходит на дельту суммой', () => {
    expect(
      planDocumentWrites(
        [
          { productId: A, quantity: 1, initialQuantity: 4 },
          { productId: A, quantity: 2, initialQuantity: null },
        ],
        -1,
        T,
        true,
      ),
    ).toEqual([{ productId: A, write: { kind: 'delta', delta: -3 } }]);
  });

  it('вебхук без initial и без времени: дельты суммируются по товару', () => {
    expect(
      planDocumentWrites(
        [
          { productId: A, quantity: 1, initialQuantity: null },
          { productId: A, quantity: 2, initialQuantity: null },
        ],
        -1,
        null,
        true,
      ),
    ).toEqual([{ productId: A, write: { kind: 'delta', delta: -3 } }]);
  });

  it('непроверенный тип документа: дельта, даже когда initial есть', () => {
    expect(
      planDocumentWrites(
        [{ productId: A, quantity: 2, initialQuantity: 9 }],
        1,
        T,
        false,
      ),
    ).toEqual([{ productId: A, write: { kind: 'delta', delta: 2 } }]);
  });

  it('пустой список позиций → пустой план', () => {
    expect(planDocumentWrites([], -1, T, true)).toEqual([]);
  });
});

/**
 * Семантика initial_quantity проверена на ЖИВЫХ данных прода только для
 * продаж и возвратов покупателя (04.08.2026: SELL 287/287 позиций за 72 ч,
 * PAYBACK 24/24 за 60 дней). Документов ACCEPT/WRITE_OFF/RETURN/INVENTORY/
 * REVALUATION у клиента нет вовсе — все движения делаются в товароучётке,
 * не на кассе. Пускать непроверенный тип в абсолютную запись остатка нельзя:
 * ошибка в знаке или в трактовке поля молча испортит остаток.
 */
describe('absoluteAllowed', () => {
  it('проверенные типы — да', () => {
    expect(absoluteAllowed('SELL')).toBe(true);
    expect(absoluteAllowed('PAYBACK')).toBe(true);
  });

  it('непроверенные движения — нет, остаются на дельте', () => {
    for (const t of ['ACCEPT', 'WRITE_OFF', 'RETURN', 'INVENTORY', 'CORRECTION'])
      expect(absoluteAllowed(t)).toBe(false);
  });
});

/**
 * Чек-как-сверка (этап 2, Путь B): initial_quantity позиции REST-документа —
 * остаток ДО операции по данным САМОГО Эвотора. Абсолют after = initial ± qty
 * чинит накопленный дрейф реплики (приёмки/списания в товароучётке, которые
 * к нам не приходят) при каждой продаже товара — без файла выгрузки.
 * Порядок применения охраняет stock_asof (см. evotor.service) — здесь только
 * чистый расчёт «что писать».
 */
describe('planStockWrite', () => {
  const T = Date.parse('2026-08-04T10:15:49.000Z');

  it('SELL с initial: абсолют after = initial − qty, asof = время документа', () => {
    expect(
      planStockWrite({ quantity: 1, initialQuantity: 4 }, -1, T, true),
    ).toEqual({ kind: 'absolute', after: 3, asofMs: T });
  });

  it('тип без проверенной семантики initial → дельта, даже если initial есть', () => {
    expect(
      planStockWrite({ quantity: 3, initialQuantity: 10 }, 1, T, false),
    ).toEqual({ kind: 'delta', delta: 3 });
  });

  it('PAYBACK с initial: возврат прибавляет, after = initial + qty', () => {
    expect(
      planStockWrite({ quantity: 2, initialQuantity: 4 }, 1, T, true),
    ).toEqual({ kind: 'absolute', after: 6, asofMs: T });
  });

  it('весовой товар: дробные initial и qty не теряют точность сверх float', () => {
    const w = planStockWrite({ quantity: 0.204, initialQuantity: 2.75 }, -1, T, true);
    expect(w.kind).toBe('absolute');
    if (w.kind === 'absolute') expect(w.after).toBeCloseTo(2.546, 9);
  });

  it('уход в минус разрешён — отрицательный остаток штатен (кривая реплика)', () => {
    expect(
      planStockWrite({ quantity: 1, initialQuantity: 0 }, -1, T, true),
    ).toEqual({ kind: 'absolute', after: -1, asofMs: T });
  });

  it('без initial (вебхук ver.2) → дельта со знаком, как раньше', () => {
    expect(planStockWrite({ quantity: 2, initialQuantity: null }, -1, T, true)).toEqual(
      { kind: 'delta', delta: -2 },
    );
    expect(planStockWrite({ quantity: 2, initialQuantity: null }, 1, T, true)).toEqual(
      { kind: 'delta', delta: 2 },
    );
  });

  it('initial без времени документа → дельта (абсолют без порядка опасен)', () => {
    // Не зная времени, нельзя понять, старее ли снимок уже применённого —
    // абсолют мог бы откатить более свежие движения. Дельта коммутативна.
    expect(
      planStockWrite({ quantity: 1, initialQuantity: 4 }, -1, null, true),
    ).toEqual({ kind: 'delta', delta: -1 });
  });
});
