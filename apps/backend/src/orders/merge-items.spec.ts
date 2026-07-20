import { describe, expect, it } from 'bun:test';
import { mergeDuplicateItems } from './merge-items';

/**
 * Находка ревью (оверселл): дубли одного slug в items[] проверяются по остатку
 * НЕЗАВИСИМО (резервы текущего заказа пишутся после цикла), поэтому
 * [{x,5},{x,5}] при 5 доступных проходили оба. Слияние до проверок делает
 * дубли эквивалентными одной строке [{x,10}] — и проверка остатка честная.
 */
describe('mergeDuplicateItems', () => {
  it('дубли складываются: [{x,5},{x,5}] → [{x,10}]', () => {
    const out = mergeDuplicateItems([
      { id: 'x', quantity: 5 },
      { id: 'x', quantity: 5 },
    ]);
    expect(out).toEqual([{ id: 'x', quantity: 10 }]);
  });

  it('разные товары не трогаются, порядок сохраняется', () => {
    const out = mergeDuplicateItems([
      { id: 'a', quantity: 1 },
      { id: 'b', quantity: 2 },
      { id: 'a', quantity: 3 },
    ]);
    expect(out).toEqual([
      { id: 'a', quantity: 4 },
      { id: 'b', quantity: 2 },
    ]);
  });

  it('прочие поля берутся из первого вхождения (priceRub для детекта цены)', () => {
    const out = mergeDuplicateItems([
      { id: 'a', quantity: 1, priceRub: 100 },
      { id: 'a', quantity: 1, priceRub: 999 },
    ]);
    expect(out).toEqual([{ id: 'a', quantity: 2, priceRub: 100 }]);
  });

  it('пустой список → пустой список', () => {
    expect(mergeDuplicateItems([])).toEqual([]);
  });
});
