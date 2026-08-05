import { describe, expect, it } from 'bun:test';
import { absoluteAllowed, planStockWrite } from './receipt-stock';

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
