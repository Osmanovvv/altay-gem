import { describe, expect, it } from 'bun:test';
import {
  CartLine,
  evaluatePromocode,
  PromocodeRules,
} from './discount';

const NOW = new Date('2026-07-06T12:00:00Z');

const rules = (over: Partial<PromocodeRules> = {}): PromocodeRules => ({
  code: 'ALTAI10',
  active: true,
  discountPercent: 10,
  ...over,
});

const cart: CartLine[] = [
  { slug: 'pantogematogen', quantity: 2, priceRub: 1260, categorySlug: 'zdorovie-altaya' },
  { slug: 'syr', quantity: 3, priceRub: 119, categorySlug: 'syry-i-maslo' },
];

describe('evaluatePromocode', () => {
  it('без ограничения категории: скидка со всей корзины', () => {
    const r = evaluatePromocode(rules(), cart, 0, NOW);
    expect(r.valid).toBe(true);
    if (r.valid) {
      // (2*1260 + 3*119) * 10% = 2877 * 0.1 = 287.7 -> 288
      expect(r.discountRub).toBe(288);
      expect(r.appliesTo).toBe('all');
    }
  });

  it('с ограничением категории: скидка только с подходящих позиций', () => {
    const r = evaluatePromocode(
      rules({ categoryRestrictionSlug: 'zdorovie-altaya' }),
      cart,
      0,
      NOW,
    );
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.discountRub).toBe(252); // 2520 * 10%
      expect(r.appliesTo).toBe('category');
    }
  });

  it('корзина без товаров нужной категории — not_applicable', () => {
    const r = evaluatePromocode(
      rules({ categoryRestrictionSlug: 'kosmetika' }),
      cart,
      0,
      NOW,
    );
    expect(r).toMatchObject({ valid: false, reason: 'not_applicable' });
  });

  it('неактивный / истёкший / будущий / лимит', () => {
    expect(
      evaluatePromocode(rules({ active: false }), cart, 0, NOW),
    ).toMatchObject({ reason: 'inactive' });
    expect(
      evaluatePromocode(rules({ validTo: '2026-01-01T00:00:00Z' }), cart, 0, NOW),
    ).toMatchObject({ reason: 'expired' });
    expect(
      evaluatePromocode(rules({ validFrom: '2027-01-01T00:00:00Z' }), cart, 0, NOW),
    ).toMatchObject({ reason: 'not_started' });
    expect(
      evaluatePromocode(rules({ usageLimit: 5 }), cart, 5, NOW),
    ).toMatchObject({ reason: 'limit_reached' });
  });

  it('пустая корзина — empty_cart', () => {
    expect(evaluatePromocode(rules(), [], 0, NOW)).toMatchObject({
      reason: 'empty_cart',
    });
  });
});
