import { describe, expect, it } from 'bun:test';
import {
  calcDelivery,
  DeliveryNotAvailableError,
  DeliveryTariffs,
  normalizeTariffs,
  orderWeightG,
} from './delivery';

const tariffs: DeliveryTariffs = {
  courierNskPriceRub: 300,
  freeDeliveryThresholdRub: 3000,
  russiaWeightTiers: [
    { weightUpToG: 1000, priceRub: 450 },
    { weightUpToG: 3000, priceRub: 650 },
    { weightUpToG: 5000, priceRub: 900 },
  ],
};
const line = (q: number, w: number, perishable = false) => ({
  quantity: q,
  unitWeightG: w,
  isPerishable: perishable,
});

describe('calcDelivery', () => {
  it('самовывоз всегда бесплатно', () => {
    expect(calcDelivery('pickup_titova', [line(5, 500)], tariffs, 100)).toBe(0);
  });

  it('курьер НСК: фикс и порог бесплатной (от суммы после скидки)', () => {
    expect(calcDelivery('courier_nsk', [line(1, 500)], tariffs, 2999)).toBe(300);
    expect(calcDelivery('courier_nsk', [line(1, 500)], tariffs, 3000)).toBe(0);
  });

  it('россия: сетка по весу заказа', () => {
    expect(orderWeightG([line(2, 450), line(1, 100)])).toBe(1000);
    expect(calcDelivery('russia', [line(2, 450), line(1, 100)], tariffs, 500)).toBe(450); // ровно 1000 г
    expect(calcDelivery('russia', [line(3, 450)], tariffs, 500)).toBe(650); // 1350 г
    expect(calcDelivery('russia', [line(1, 5000)], tariffs, 500)).toBe(900); // ровно верхняя граница
  });

  /**
   * Раньше заказ тяжелее верхнего тира считался ПО ВЕРХНЕМУ тиру: посылка
   * 15 кг уезжала по цене пятикилограммовой. Верхней границы массы нет и в
   * DTO (999 единиц на позицию × 100 позиций), так что это была открытая
   * денежная дыра. Сетка тарифов описывает то, что мы умеем отправлять;
   * выше сетки — отказ и приглашение связаться, а не молчаливый недобор.
   */
  it('россия: тяжелее верхнего тира — отказ, а не цена верхнего тира', () => {
    expect(() => calcDelivery('russia', [line(2, 4000)], tariffs, 500)).toThrow(
      DeliveryNotAvailableError,
    );
    try {
      calcDelivery('russia', [line(2, 4000)], tariffs, 500);
    } catch (e) {
      expect((e as DeliveryNotAvailableError).code).toBe('WEIGHT_LIMIT');
      expect((e as DeliveryNotAvailableError).message).toContain('свяжитесь');
    }
  });

  it('расширение сетки снимает отказ — потолок задаёт админка, а не код', () => {
    const wider: DeliveryTariffs = {
      ...tariffs,
      russiaWeightTiers: [...tariffs.russiaWeightTiers, { weightUpToG: 20000, priceRub: 2500 }],
    };
    expect(calcDelivery('russia', [line(2, 4000)], wider, 500)).toBe(2500);
  });

  it('россия со скоропортящимся — блокируется', () => {
    expect(() =>
      calcDelivery('russia', [line(1, 100, true)], tariffs, 500),
    ).toThrow(DeliveryNotAvailableError);
  });

  /**
   * ТЗ р.12: «вес заказа считается по массам товаров (весовые — по порциям,
   * штучные — по весу из характеристик)». Догадки там нет. Раньше товар без
   * веса молча считался как 500 г — цена доставки выходила неверной в обе
   * стороны и никто об этом не узнавал. Вес неизвестен → отказ.
   *
   * Самовывоза и курьера по НСК это не касается: там вес на цену не влияет,
   * и заказ обязан проходить.
   */
  it('вес неизвестен — доставку по России не считаем', () => {
    const unknown = { quantity: 1, unitWeightG: null, isPerishable: false };
    try {
      calcDelivery('russia', [unknown], tariffs, 500);
      throw new Error('ожидался отказ');
    } catch (e) {
      expect(e).toBeInstanceOf(DeliveryNotAvailableError);
      expect((e as DeliveryNotAvailableError).code).toBe('WEIGHT_UNKNOWN');
    }
  });

  it('неизвестный вес не мешает самовывозу и курьеру — там вес не при чём', () => {
    const unknown = { quantity: 2, unitWeightG: null, isPerishable: false };
    expect(calcDelivery('pickup_titova', [unknown], tariffs, 100)).toBe(0);
    expect(calcDelivery('courier_nsk', [unknown], tariffs, 100)).toBe(300);
  });

  it('одна позиция без веса портит весь заказ — считать по остальным нельзя', () => {
    const lines = [line(1, 500), { quantity: 1, unitWeightG: null, isPerishable: false }];
    expect(() => calcDelivery('russia', lines, tariffs, 500)).toThrow(
      DeliveryNotAvailableError,
    );
  });

  it('вес заказа неизвестен, если неизвестен хоть у одной позиции', () => {
    expect(orderWeightG([line(2, 250)])).toBe(500);
    expect(
      orderWeightG([line(2, 250), { quantity: 1, unitWeightG: null, isPerishable: false }]),
    ).toBeNull();
  });

  it('россия без тарифной сетки — ошибка конфигурации', () => {
    expect(() =>
      calcDelivery('russia', [line(1, 100)], { ...tariffs, russiaWeightTiers: [] }, 500),
    ).toThrow('не настроены');
  });
});

/**
 * Тарифы приходят из Strapi. Денежные поля там decimal, и Strapi на Postgres
 * отдаёт их СТРОКОЙ. Курьерская цена и порог уже оборачивались Number(), а тиры
 * прокидывались приведением типа «как есть» — то есть строка доезжала до
 * арифметики. `subtotal - discount + "450"` даёт склейку строк, и в заказ
 * уходит чудовищная сумма. Нормализуем один раз, в одном месте.
 */
describe('normalizeTariffs', () => {
  it('строки из Strapi превращаются в числа', () => {
    const t = normalizeTariffs({
      courierNskPriceRub: '300',
      freeDeliveryThresholdRub: '3000',
      russiaWeightTiers: [{ weightUpToG: '1000', priceRub: '450.00' }],
    });
    expect(t.courierNskPriceRub).toBe(300);
    expect(t.freeDeliveryThresholdRub).toBe(3000);
    expect(t.russiaWeightTiers).toEqual([{ weightUpToG: 1000, priceRub: 450 }]);
    // И считается уже числом, а не строкой.
    expect(calcDelivery('russia', [line(1, 100)], t, 0)).toBe(450);
  });

  it('порог не задан — остаётся null, а не превращается в 0', () => {
    // 0 означал бы «доставка бесплатна всегда» — это раздача денег.
    expect(normalizeTariffs({ freeDeliveryThresholdRub: null }).freeDeliveryThresholdRub).toBeNull();
    expect(normalizeTariffs({}).freeDeliveryThresholdRub).toBeNull();
  });

  it('пустые и битые тиры отбрасываются, а не дают NaN в цене доставки', () => {
    const t = normalizeTariffs({
      russiaWeightTiers: [
        { weightUpToG: 1000, priceRub: 450 },
        { weightUpToG: 'abc', priceRub: 500 },
        { weightUpToG: 2000, priceRub: null },
        { weightUpToG: 0, priceRub: 100 },
        { weightUpToG: -5, priceRub: 100 },
      ],
    });
    expect(t.russiaWeightTiers).toEqual([{ weightUpToG: 1000, priceRub: 450 }]);
  });

  it('бесплатный тир допустим — цена 0 это не «битое значение»', () => {
    const t = normalizeTariffs({
      russiaWeightTiers: [{ weightUpToG: 500, priceRub: 0 }],
    });
    expect(t.russiaWeightTiers).toEqual([{ weightUpToG: 500, priceRub: 0 }]);
  });

  it('сетки нет вовсе — пустой массив, дальше сработает NO_TARIFF', () => {
    expect(normalizeTariffs({}).russiaWeightTiers).toEqual([]);
    expect(normalizeTariffs({ russiaWeightTiers: 'мусор' }).russiaWeightTiers).toEqual([]);
  });

  it('отсутствующая цена курьера — 0, а не NaN', () => {
    expect(normalizeTariffs({}).courierNskPriceRub).toBe(0);
    expect(normalizeTariffs({ courierNskPriceRub: 'abc' }).courierNskPriceRub).toBe(0);
  });
});
