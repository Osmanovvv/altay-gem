import { describe, expect, test } from 'bun:test';
import { allocateAcrossStores } from './allocate-stores';

/**
 * Распределение количества по магазинам для доставки (курьер/Россия): заказ
 * собирается из ЛЮБЫХ точек, поэтому доступное = сумма по магазинам, а не один
 * «магазин записи товара». Пункт самовывоза эту функцию не использует (там —
 * конкретная точка). Багфикс: курьер блокировал товар, которого 22 в наличии,
 * потому что смотрел на пустой магазин записи вместо агрегата.
 */
describe('allocateAcrossStores', () => {
  test('весь остаток в одном магазине покрывает заказ → одна аллокация', () => {
    const r = allocateAcrossStores(
      [
        { id: 'len', available: 22 },
        { id: 'tit', available: 0 },
      ],
      1,
    );
    expect(r.ok).toBe(true);
    expect(r.total).toBe(22);
    expect(r.allocations).toEqual([{ id: 'len', qty: 1 }]);
  });

  test('одинаковый склад (1/0) → курьер доступен независимо от «магазина записи»', () => {
    // Именно этот случай отличал муку (OK) от силапанта (БЛОК) при равном складе.
    const r = allocateAcrossStores(
      [
        { id: 'len', available: 1 },
        { id: 'tit', available: 0 },
      ],
      1,
    );
    expect(r.ok).toBe(true);
    expect(r.allocations).toEqual([{ id: 'len', qty: 1 }]);
  });

  test('не хватает ни в одном, но сумма покрывает → сплит по магазинам, больший первым', () => {
    const r = allocateAcrossStores(
      [
        { id: 'len', available: 3 },
        { id: 'tit', available: 4 },
      ],
      5,
    );
    expect(r.ok).toBe(true);
    expect(r.total).toBe(7);
    // больший магазин (tit=4) отдаёт первым, остаток добираем из len
    expect(r.allocations).toEqual([
      { id: 'tit', qty: 4 },
      { id: 'len', qty: 1 },
    ]);
  });

  test('агрегат меньше заказа → ok=false, без частичных аллокаций', () => {
    const r = allocateAcrossStores(
      [
        { id: 'len', available: 2 },
        { id: 'tit', available: 1 },
      ],
      5,
    );
    expect(r.ok).toBe(false);
    expect(r.total).toBe(3);
    expect(r.allocations).toEqual([]);
  });

  test('отрицательный остаток трактуется как 0', () => {
    const r = allocateAcrossStores(
      [
        { id: 'len', available: -3 },
        { id: 'tit', available: 2 },
      ],
      2,
    );
    expect(r.ok).toBe(true);
    expect(r.total).toBe(2);
    expect(r.allocations).toEqual([{ id: 'tit', qty: 2 }]);
  });

  test('детерминированный порядок при равном остатке (tiebreak по storeId)', () => {
    const r = allocateAcrossStores(
      [
        { id: 'tit', available: 3 },
        { id: 'len', available: 3 },
      ],
      4,
    );
    // равный остаток → по storeId по возрастанию: len раньше tit
    expect(r.allocations).toEqual([
      { id: 'len', qty: 3 },
      { id: 'tit', qty: 1 },
    ]);
  });

  test('нулевое количество → ok, без аллокаций', () => {
    const r = allocateAcrossStores([{ id: 'len', available: 5 }], 0);
    expect(r.ok).toBe(true);
    expect(r.allocations).toEqual([]);
  });

  test('дубли номенклатуры в одном магазине: ключ — строка (uuid), не магазин', () => {
    // Одна точка держит товар двумя строками Эвотора (разные uuid) — резерв
    // распределяется по строкам, каждая по своему uuid (create резервирует так же).
    const r = allocateAcrossStores(
      [
        { id: 'uuid-A', available: 2 },
        { id: 'uuid-B', available: 3 },
      ],
      4,
    );
    expect(r.ok).toBe(true);
    expect(r.total).toBe(5);
    // больший (B=3) первым, добор из A
    expect(r.allocations).toEqual([
      { id: 'uuid-B', qty: 3 },
      { id: 'uuid-A', qty: 1 },
    ]);
  });
});
