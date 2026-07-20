import { describe, expect, it } from 'bun:test';
import { rubToKopecks } from './receipt';

/**
 * Находка ревью: квантование float-копеек было только внутри сборки чека, а
 * INSERT в integer-колонки БД и сумма платежа считались как `rub * 100` —
 * дробный тариф из Strapi (300.03) давал 30002.999999999996: PG 22P02 на
 * создании заказа (чекаут 500) и малформный amount для ЮKassa.
 */
describe('rubToKopecks', () => {
  it('300.03 ₽ → ровно 30003 коп (не 30002.999999999996)', () => {
    expect(rubToKopecks(300.03)).toBe(30003);
    expect(Number.isInteger(rubToKopecks(300.03))).toBe(true);
  });

  it('целые рубли не меняются', () => {
    expect(rubToKopecks(1260)).toBe(126000);
    expect(rubToKopecks(0)).toBe(0);
  });

  it('копеечные цены из Эвотора (123.45) → 12345', () => {
    expect(rubToKopecks(123.45)).toBe(12345);
  });
});
