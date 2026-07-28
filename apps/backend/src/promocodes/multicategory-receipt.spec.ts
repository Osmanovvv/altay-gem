import { describe, expect, test } from 'bun:test';
import { evaluatePromocode, isDiscountEligible, type CartLine } from './discount';
import { lineNetsAfterDiscount } from '../orders/receipt';

/**
 * Сквозная проверка мульти-категорийного промокода: расчёт скидки в корзине →
 * снапшот discountEligible строк заказа → распределение скидки по позициям
 * фискального чека. Именно на стыке этих трёх шагов расхождение означало бы
 * «покупателю показали одну скидку, а в чек 54-ФЗ ушла другая».
 */
describe('промокод на НЕСКОЛЬКО категорий: корзина → заказ → чек', () => {
  const NOW = new Date('2026-07-28T12:00:00Z');
  // 3 категории в корзине, скидка действует на две из них.
  const cart: CartLine[] = [
    { slug: 'pantogematogen', quantity: 2, priceRub: 1260, categorySlug: 'zdorovie-altaya' },
    { slug: 'syr', quantity: 3, priceRub: 119, categorySlug: 'syry-i-maslo' },
    { slug: 'krem', quantity: 1, priceRub: 500, categorySlug: 'kosmetika' },
  ];
  const PROMO_CATEGORIES = ['zdorovie-altaya', 'syry-i-maslo'];

  test('скидка считается только с подпадающих категорий', () => {
    const r = evaluatePromocode(
      { code: 'MULTI10', active: true, discountPercent: 10, categoryRestrictionSlugs: PROMO_CATEGORIES },
      cart,
      0,
      NOW,
    );
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    // (2*1260 + 3*119) * 10% = 2877 * 0.1 = 287.7 → 288; косметика не участвует
    expect(r.discountRub).toBe(288);
    expect(r.categorySlugs).toEqual(PROMO_CATEGORIES);
  });

  test('чек: скидка распределена ровно по подпадающим строкам, сумма сходится', () => {
    const r = evaluatePromocode(
      { code: 'MULTI10', active: true, discountPercent: 10, categoryRestrictionSlugs: PROMO_CATEGORIES },
      cart,
      0,
      NOW,
    );
    if (!r.valid) throw new Error('промокод должен быть валиден');

    // Снапшот строк заказа тем же правилом, что пишется в order_items.
    const lines = cart.map((l) => ({
      priceKopecks: l.priceRub * 100,
      quantity: l.quantity,
      discountEligible: isDiscountEligible(l.categorySlug, r.categorySlugs),
    }));
    expect(lines.map((l) => l.discountEligible)).toEqual([true, true, false]);

    const nets = lineNetsAfterDiscount(lines, r.discountRub * 100);
    const gross = lines.map((l) => l.priceKopecks * l.quantity);

    // Косметика (вне категорий промокода) в чеке идёт по полной цене.
    expect(nets[2]).toBe(gross[2]);
    // Обе подпадающие строки реально подешевели.
    expect(nets[0]).toBeLessThan(gross[0]);
    expect(nets[1]).toBeLessThan(gross[1]);
    // Итог чека = корзина минус скидка, до копейки.
    const sumGross = gross.reduce((a, b) => a + b, 0);
    const sumNet = nets.reduce((a, b) => a + b, 0);
    expect(sumNet).toBe(sumGross - r.discountRub * 100);
  });

  test('скидка на ВСЁ (категории не выбраны): дешевеют все строки', () => {
    const r = evaluatePromocode(
      { code: 'ALL10', active: true, discountPercent: 10, categoryRestrictionSlugs: [] },
      cart,
      0,
      NOW,
    );
    if (!r.valid) throw new Error('промокод должен быть валиден');
    const lines = cart.map((l) => ({
      priceKopecks: l.priceRub * 100,
      quantity: l.quantity,
      discountEligible: isDiscountEligible(l.categorySlug, r.categorySlugs),
    }));
    expect(lines.every((l) => l.discountEligible)).toBe(true);
    const nets = lineNetsAfterDiscount(lines, r.discountRub * 100);
    const sumGross = lines.reduce((s, l) => s + l.priceKopecks * l.quantity, 0);
    expect(nets.reduce((a, b) => a + b, 0)).toBe(sumGross - r.discountRub * 100);
  });
});
