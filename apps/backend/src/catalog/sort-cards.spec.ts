import { describe, expect, test } from 'bun:test';
import { sortCards, type SortKey } from './sort-cards';

const card = (name: string, priceRub: number, inStock: boolean) =>
  ({ name, priceRub, inStock }) as Parameters<typeof sortCards>[0][number];

describe('порядок товаров в каталоге', () => {
  /**
   * Главное правило, и оно важнее выбранной сортировки. Пока товаров было
   * девять, порядок ничего не решал. На пятистах позициях сортировка «сначала
   * дешёвые» вывела наверх распроданное: первое, что видел покупатель на
   * витрине — стена карточек «Нет в наличии». Купить нельзя ни одну.
   */
  test('в наличии — выше распроданного, при любой сортировке', () => {
    const items = [
      card('Распродано дешёвое', 35, false),
      card('Есть дорогое', 900, true),
      card('Распродано дорогое', 800, false),
      card('Есть дешёвое', 100, true),
    ];
    for (const sort of ['price_asc', 'price_desc', 'name'] as SortKey[]) {
      const names = sortCards(items, sort).map((i) => i.name);
      expect(names.slice(0, 2).every((n) => n.startsWith('Есть'))).toBe(true);
    }
  });

  test('внутри доступных работает выбранная сортировка', () => {
    const items = [
      card('Дорогое', 900, true),
      card('Дешёвое', 100, true),
      card('Среднее', 500, true),
    ];
    expect(sortCards(items, 'price_asc').map((i) => i.name)).toEqual([
      'Дешёвое', 'Среднее', 'Дорогое',
    ]);
    expect(sortCards(items, 'price_desc').map((i) => i.name)).toEqual([
      'Дорогое', 'Среднее', 'Дешёвое',
    ]);
  });

  test('распроданные тоже упорядочены, а не свалены как попало', () => {
    const items = [
      card('Дорогое', 900, false),
      card('Дешёвое', 100, false),
    ];
    expect(sortCards(items, 'price_asc').map((i) => i.name)).toEqual([
      'Дешёвое', 'Дорогое',
    ]);
  });

  test('сортировка по названию — по-русски, а не по кодам символов', () => {
    const items = [card('Ёлка', 10, true), card('Апельсин', 20, true), card('Яблоко', 30, true)];
    expect(sortCards(items, 'name').map((i) => i.name)).toEqual([
      'Апельсин', 'Ёлка', 'Яблоко',
    ]);
  });

  test('исходный массив не меняется', () => {
    const items = [card('Б', 2, true), card('А', 1, true)];
    const copy = [...items];
    sortCards(items, 'name');
    expect(items).toEqual(copy);
  });

  test('неизвестная сортировка не роняет каталог', () => {
    const items = [card('Есть', 100, true), card('Нет', 10, false)];
    expect(sortCards(items, 'непонятно' as SortKey).map((i) => i.name)).toEqual(['Есть', 'Нет']);
  });
});
