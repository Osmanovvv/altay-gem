import { describe, expect, test } from 'bun:test';
import { matchesQuery, normalizeForSearch } from './search-text';

const card = (name: string, subcategory?: string, shortDescription?: string) =>
  ({ name, subcategory, shortDescription }) as Parameters<typeof matchesQuery>[0];

describe('поиск по каталогу', () => {
  /**
   * Ради этого всё и написано. Категория магазина называется «Мёд и
   * пчелопродукция», а товары в кассе заведены как «Мед Донник», «Мед Акация» —
   * кассиру некогда искать букву «ё». Покупатель читает название категории,
   * набирает «мёд» и не находит НИЧЕГО: 19 позиций мёда есть, а поиск пуст.
   */
  test('«мёд» находит «Мед», и наоборот', () => {
    expect(matchesQuery(card('Мед Донник 2025'), 'мёд')).toBe(true);
    expect(matchesQuery(card('Мёд горный'), 'мед')).toBe(true);
  });

  test('регистр не важен', () => {
    expect(matchesQuery(card('Мед Акация'), 'МЁД')).toBe(true);
    expect(matchesQuery(card('ПАСТИЛА ванильная'), 'пастила')).toBe(true);
  });

  test('ищет и по подкатегории, и по описанию, а не только по названию', () => {
    expect(matchesQuery(card('Бальзам', 'Пантопродукция'), 'панто')).toBe(true);
    expect(matchesQuery(card('Бальзам', undefined, 'на кедровом орехе'), 'кедров')).toBe(true);
  });

  test('пустых полей не боится', () => {
    expect(matchesQuery(card('Мёд'), 'мёд')).toBe(true);
    expect(matchesQuery(card(''), 'мёд')).toBe(false);
  });

  test('чужое слово не находится', () => {
    expect(matchesQuery(card('Мед Донник'), 'колбаса')).toBe(false);
  });

  /** Лишние пробелы по краям — обычное дело при наборе на телефоне. */
  test('пробелы по краям запроса не мешают', () => {
    expect(matchesQuery(card('Мед Донник'), '  мёд  ')).toBe(true);
  });

  test('пустой запрос никого не отсеивает', () => {
    expect(matchesQuery(card('Что угодно'), '')).toBe(true);
    expect(matchesQuery(card('Что угодно'), '   ')).toBe(true);
  });

  describe('приведение текста', () => {
    test('ё превращается в е, регистр опускается', () => {
      expect(normalizeForSearch('Мёд Гречишный')).toBe('мед гречишный');
      expect(normalizeForSearch('ЁЛКА')).toBe('елка');
    });

    test('пусто и мусор не роняют', () => {
      expect(normalizeForSearch('')).toBe('');
      expect(normalizeForSearch(null)).toBe('');
      expect(normalizeForSearch(undefined)).toBe('');
    });
  });
});
