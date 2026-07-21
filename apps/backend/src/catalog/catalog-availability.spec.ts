import { describe, expect, test } from 'bun:test';
import { perStoreAvailability } from './catalog-availability';

describe('perStoreAvailability', () => {
  const pickupStores = [
    { point: 'pickup_leningradskaya' as const, storeId: 'len' },
    { point: 'pickup_titova' as const, storeId: 'tit' },
  ];

  test('штучный в двух магазинах: агрегат = сумма буферизованных', () => {
    const r = perStoreAvailability({
      perStoreQty: [
        { storeId: 'len', qty: 3 },
        { storeId: 'tit', qty: 2 },
      ],
      measure: 'шт',
      portionMassG: null,
      buffer: 1,
      pickupStores,
    });
    // Лен 3−1=2, Тит 2−1=1 → агрегат 3 (а не 4, как при буфере-на-сумму)
    expect(r.totalUnits).toBe(3);
    expect(r.pickupAvailability).toEqual([
      { point: 'pickup_leningradskaya', availableQty: 2 },
      { point: 'pickup_titova', availableQty: 1 },
    ]);
  });

  test('товар только в одном магазине: вторая точка 0', () => {
    const r = perStoreAvailability({
      perStoreQty: [{ storeId: 'len', qty: 5 }],
      measure: 'шт',
      portionMassG: null,
      buffer: 1,
      pickupStores,
    });
    expect(r.totalUnits).toBe(4);
    expect(r.pickupAvailability).toEqual([
      { point: 'pickup_leningradskaya', availableQty: 4 },
      { point: 'pickup_titova', availableQty: 0 },
    ]);
  });

  test('весовой: floor порций ПО КАЖДОМУ магазину до буфера', () => {
    const r = perStoreAvailability({
      perStoreQty: [
        { storeId: 'len', qty: 0.95 },
        { storeId: 'tit', qty: 0.95 },
      ],
      measure: 'кг',
      portionMassG: 1000,
      buffer: 0,
      pickupStores,
    });
    // По 0.95 кг при порции 1 кг: из КАЖДОЙ точки 0 порций → агрегат 0
    // (старая математика на сумме 1.9 кг показала бы 1 — недостижимую)
    expect(r.totalUnits).toBe(0);
  });

  test('магазин не-точка входит в агрегат, но не в разбивку', () => {
    const r = perStoreAvailability({
      perStoreQty: [
        { storeId: 'len', qty: 3 },
        { storeId: 'warehouse', qty: 10 },
      ],
      measure: 'шт',
      portionMassG: null,
      buffer: 1,
      pickupStores,
    });
    expect(r.totalUnits).toBe(2 + 9);
    expect(r.pickupAvailability).toEqual([
      { point: 'pickup_leningradskaya', availableQty: 2 },
      { point: 'pickup_titova', availableQty: 0 },
    ]);
  });
});
