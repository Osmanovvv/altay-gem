import { describe, expect, test } from 'bun:test';
import { relationSlugs } from './strapi.service';

/**
 * Страховка денежного пути: Strapi и бэкенд деплоятся раздельно, и в окне
 * между рестартами связь «категории промокода» может прийти как одиночный
 * объект (старая схема oneToOne) или как массив (новая manyToMany).
 * Наивное чтение объекта из массива дало бы пустое ограничение → скидка
 * растеклась бы на всю корзину. Оба формата обязаны читаться одинаково.
 */
describe('relationSlugs', () => {
  test('массив (manyToMany) → все слаги', () => {
    expect(
      relationSlugs([{ slug: 'zdorovie-altaya' }, { slug: 'syry-i-maslo' }]),
    ).toEqual(['zdorovie-altaya', 'syry-i-maslo']);
  });

  test('одиночный объект (старая схема oneToOne) → один слаг', () => {
    expect(relationSlugs({ slug: 'zdorovie-altaya' })).toEqual([
      'zdorovie-altaya',
    ]);
  });

  test('null / undefined / пустой массив → пусто (скидка на всю корзину)', () => {
    expect(relationSlugs(null)).toEqual([]);
    expect(relationSlugs(undefined)).toEqual([]);
    expect(relationSlugs([])).toEqual([]);
  });

  test('мусор в связи отбрасывается, а не роняет расчёт', () => {
    expect(
      relationSlugs([{ slug: 'ok' }, {}, null, { slug: '' }, { slug: 42 }]),
    ).toEqual(['ok']);
  });
});
