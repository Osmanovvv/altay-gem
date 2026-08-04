import { describe, expect, it } from 'bun:test';
import { planStockWrite } from './receipt-stock';

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
      planStockWrite({ quantity: 1, initialQuantity: 4 }, -1, T),
    ).toEqual({ kind: 'absolute', after: 3, asofMs: T });
  });

  it('PAYBACK с initial: возврат прибавляет, after = initial + qty', () => {
    expect(
      planStockWrite({ quantity: 2, initialQuantity: 4 }, 1, T),
    ).toEqual({ kind: 'absolute', after: 6, asofMs: T });
  });

  it('весовой товар: дробные initial и qty не теряют точность сверх float', () => {
    const w = planStockWrite({ quantity: 0.204, initialQuantity: 2.75 }, -1, T);
    expect(w.kind).toBe('absolute');
    if (w.kind === 'absolute') expect(w.after).toBeCloseTo(2.546, 9);
  });

  it('уход в минус разрешён — отрицательный остаток штатен (кривая реплика)', () => {
    expect(
      planStockWrite({ quantity: 1, initialQuantity: 0 }, -1, T),
    ).toEqual({ kind: 'absolute', after: -1, asofMs: T });
  });

  it('без initial (вебхук ver.2) → дельта со знаком, как раньше', () => {
    expect(planStockWrite({ quantity: 2, initialQuantity: null }, -1, T)).toEqual(
      { kind: 'delta', delta: -2 },
    );
    expect(planStockWrite({ quantity: 2, initialQuantity: null }, 1, T)).toEqual(
      { kind: 'delta', delta: 2 },
    );
  });

  it('initial без времени документа → дельта (абсолют без порядка опасен)', () => {
    // Не зная времени, нельзя понять, старее ли снимок уже применённого —
    // абсолют мог бы откатить более свежие движения. Дельта коммутативна.
    expect(
      planStockWrite({ quantity: 1, initialQuantity: 4 }, -1, null),
    ).toEqual({ kind: 'delta', delta: -1 });
  });
});
