import { describe, expect, it } from 'bun:test';
import {
  calcDelivery,
  DeliveryNotAvailableError,
  DeliveryTariffs,
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
    expect(calcDelivery('russia', [line(2, 4000)], tariffs, 500)).toBe(900); // тяжелее максимума
  });

  it('россия со скоропортящимся — блокируется', () => {
    expect(() =>
      calcDelivery('russia', [line(1, 100, true)], tariffs, 500),
    ).toThrow(DeliveryNotAvailableError);
  });

  it('россия без тарифной сетки — ошибка конфигурации', () => {
    expect(() =>
      calcDelivery('russia', [line(1, 100)], { ...tariffs, russiaWeightTiers: [] }, 500),
    ).toThrow('не настроены');
  });
});
