import { describe, expect, it } from 'bun:test';
import { cardPriceRub, displayOldPrice } from './catalog-pricing';

/**
 * Цена карточки. У весового товара Эвотор хранит цену за КИЛОГРАММ, а витрина
 * продаёт порциями (ТЗ р.6.4: «единица продажи — шт / порция N г»), поэтому
 * показывать надо цену порции. Формула нужна в двух местах — в карточке и в
 * подсказке контент-менеджеру при вводе старой цены, — и обязана быть одна:
 * иначе админка будет проверять ввод против не той цены, что видит покупатель.
 */
describe('cardPriceRub', () => {
  it('штучный товар — цена как есть, из копеек в рубли', () => {
    expect(cardPriceRub({ priceKopecks: 69000, measure: 'шт', portionMassG: null })).toBe(690);
  });

  it('весовой товар — цена ПОРЦИИ, а не килограмма', () => {
    // 1190 ₽/кг, порция 100 г → 119 ₽
    expect(cardPriceRub({ priceKopecks: 119000, measure: 'кг', portionMassG: 100 })).toBe(119);
    // порция 250 г от той же цены
    expect(cardPriceRub({ priceKopecks: 119000, measure: 'кг', portionMassG: 250 })).toBe(298);
  });

  it('масса порции не задана — берётся 100 г по умолчанию', () => {
    expect(cardPriceRub({ priceKopecks: 119000, measure: 'кг', portionMassG: null })).toBe(119);
  });

  it('копейки округляются до рубля', () => {
    expect(cardPriceRub({ priceKopecks: 69050, measure: 'шт', portionMassG: null })).toBe(691);
    expect(cardPriceRub({ priceKopecks: 69049, measure: 'шт', portionMassG: null })).toBe(690);
  });
});

/**
 * Показ «старой цены» и бейджа «-N%» (ТЗ р.6.4, 6.5, 6.6, 9).
 *
 * По плану проекта (ПЛАН РАЗРАБОТКИ, стр. 469, 487-488) старая цена — витринное
 * поле Strapi, бейдж вычисляет сервер, фактическая скидка идёт через промокоды.
 * Значит на витрине это УТВЕРЖДЕНИЕ О ЦЕНЕ, и оно обязано быть непротиворечивым:
 * зачёркнутое число всегда больше текущего, иначе покупатель видит «скидку
 * наоборот».
 *
 * Живой дефект 09.08.2026: цену в кассе подняли выше вписанной старой — бейдж
 * гасился, а сама зачёркнутая цена продолжала уходить на витрину.
 */
describe('displayOldPrice', () => {
  it('старая цена выше текущей — показываем её и считаем процент', () => {
    expect(displayOldPrice({ oldPriceRub: 200, priceRub: 150 })).toEqual({
      oldPriceRub: 200,
      discountBadge: '-25%',
    });
  });

  it('старая цена НИЖЕ текущей — не показываем ничего (цену в кассе подняли)', () => {
    expect(displayOldPrice({ oldPriceRub: 100, priceRub: 150 })).toEqual({
      oldPriceRub: null,
      discountBadge: null,
    });
  });

  it('старая цена равна текущей — скидки нет', () => {
    expect(displayOldPrice({ oldPriceRub: 150, priceRub: 150 })).toEqual({
      oldPriceRub: null,
      discountBadge: null,
    });
  });

  it('поле не заполнено — ничего не показываем', () => {
    expect(displayOldPrice({ oldPriceRub: null, priceRub: 150 })).toEqual({
      oldPriceRub: null,
      discountBadge: null,
    });
    expect(displayOldPrice({ oldPriceRub: undefined, priceRub: 150 })).toEqual({
      oldPriceRub: null,
      discountBadge: null,
    });
  });

  it('ноль и отрицательные значения игнорируются, а не дают «-100%»', () => {
    expect(displayOldPrice({ oldPriceRub: 0, priceRub: 150 })).toEqual({
      oldPriceRub: null,
      discountBadge: null,
    });
    expect(displayOldPrice({ oldPriceRub: -50, priceRub: 150 })).toEqual({
      oldPriceRub: null,
      discountBadge: null,
    });
  });

  it('разница меньше процента — не рисуем «-0%»', () => {
    // 150 → 150,4: округление дало бы «-0%», это мусор на карточке.
    expect(displayOldPrice({ oldPriceRub: 150.4, priceRub: 150 })).toEqual({
      oldPriceRub: null,
      discountBadge: null,
    });
  });

  it('процент округляется как раньше — контракт витрины не меняется', () => {
    // 999 → 799 = 20,02% → «-20%»
    expect(displayOldPrice({ oldPriceRub: 999, priceRub: 799 }).discountBadge).toBe('-20%');
    // 100 → 67 = 33% ровно
    expect(displayOldPrice({ oldPriceRub: 100, priceRub: 67 }).discountBadge).toBe('-33%');
  });

  it('нулевая текущая цена не роняет расчёт и не даёт «-100%» задаром', () => {
    expect(displayOldPrice({ oldPriceRub: 200, priceRub: 0 })).toEqual({
      oldPriceRub: null,
      discountBadge: null,
    });
  });
});
