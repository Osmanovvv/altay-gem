import { describe, expect, it } from 'bun:test';
import { applyStockBuffer, safePortionMassG } from './stock';

/**
 * Буфер против двойной продажи (ТЗ п.8, Путь B). Под Путём B мы не пишем
 * остаток в Эвотор, поэтому последний экземпляр может быть продан офлайн на
 * кассе ровно в момент онлайн-заказа. Буфер придерживает N единиц: витрина и
 * проверка при заказе видят на N меньше — последний экземпляр не «уходит» дважды.
 */
describe('applyStockBuffer', () => {
  it('вычитает буфер из доступного к продаже', () => {
    expect(applyStockBuffer(5, 1)).toBe(4);
  });

  it('последний экземпляр придержан (1 − 1 = 0)', () => {
    expect(applyStockBuffer(1, 1)).toBe(0);
  });

  it('не уходит в минус', () => {
    expect(applyStockBuffer(0, 1)).toBe(0);
    expect(applyStockBuffer(1, 2)).toBe(0);
  });

  it('буфер 0 — витрина показывает всё (защита отключена)', () => {
    expect(applyStockBuffer(5, 0)).toBe(5);
  });

  it('буфер 2 придерживает два экземпляра', () => {
    expect(applyStockBuffer(3, 2)).toBe(1);
  });

  it('отрицательный буфер трактуется как 0 (защитно)', () => {
    expect(applyStockBuffer(5, -1)).toBe(5);
  });
});

describe('safePortionMassG', () => {
  it('положительная масса порции — как есть', () => {
    expect(safePortionMassG(150)).toBe(150);
  });
  it('null/undefined → дефолт 100 г', () => {
    expect(safePortionMassG(null)).toBe(100);
    expect(safePortionMassG(undefined)).toBe(100);
  });
  it('0 → дефолт 100 (иначе деление на ноль обошло бы буфер = перепродажа)', () => {
    expect(safePortionMassG(0)).toBe(100);
  });
  it('отрицательная → дефолт 100', () => {
    expect(safePortionMassG(-5)).toBe(100);
  });
});
