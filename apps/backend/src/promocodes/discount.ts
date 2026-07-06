/**
 * Чистая логика промокодов (ТЗ 8.3): валидация условий и расчёт скидки.
 * Без I/O — покрывается юнит-тестами.
 */

export interface PromocodeRules {
  code: string;
  active: boolean;
  discountPercent: number;
  validFrom?: string | null;
  validTo?: string | null;
  usageLimit?: number | null;
  categoryRestrictionSlug?: string | null;
}

export interface CartLine {
  slug: string;
  quantity: number;
  priceRub: number;
  categorySlug: string | null;
}

export type PromoRejectReason =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'limit_reached'
  | 'not_applicable'
  | 'empty_cart';

export type PromoResult =
  | {
      valid: true;
      code: string;
      discountPercent: number;
      discountRub: number;
      appliesTo: 'all' | 'category';
      categorySlug: string | null;
      message: string;
    }
  | { valid: false; reason: PromoRejectReason; message: string };

export const PROMO_MESSAGES: Record<PromoRejectReason, string> = {
  not_found: 'Такой промокод не найден',
  inactive: 'Промокод не действует',
  not_started: 'Промокод ещё не начал действовать',
  expired: 'Срок действия промокода истёк',
  limit_reached: 'Лимит применений промокода исчерпан',
  not_applicable: 'Промокод не применим к товарам в корзине',
  empty_cart: 'Корзина пуста',
};

export function reject(reason: PromoRejectReason): PromoResult {
  return { valid: false, reason, message: PROMO_MESSAGES[reason] };
}

/**
 * Проверяет правила промокода против корзины и считает скидку в рублях.
 * @param usedCount — сколько раз код уже применён (журнал promocode_usages)
 * @param now — текущий момент (параметр — для тестируемости)
 */
export function evaluatePromocode(
  rules: PromocodeRules,
  cart: CartLine[],
  usedCount: number,
  now: Date,
): PromoResult {
  if (!rules.active) return reject('inactive');
  if (rules.validFrom && now < new Date(rules.validFrom)) {
    return reject('not_started');
  }
  if (rules.validTo && now > new Date(rules.validTo)) {
    return reject('expired');
  }
  if (rules.usageLimit != null && usedCount >= rules.usageLimit) {
    return reject('limit_reached');
  }
  if (cart.length === 0) return reject('empty_cart');

  const restricted = rules.categoryRestrictionSlug ?? null;
  const eligible = restricted
    ? cart.filter((l) => l.categorySlug === restricted)
    : cart;
  const baseRub = eligible.reduce(
    (sum, l) => sum + l.priceRub * l.quantity,
    0,
  );
  if (baseRub <= 0) return reject('not_applicable');

  const discountRub = Math.round((baseRub * rules.discountPercent) / 100);
  if (discountRub <= 0) return reject('not_applicable');

  return {
    valid: true,
    code: rules.code,
    discountPercent: rules.discountPercent,
    discountRub,
    appliesTo: restricted ? 'category' : 'all',
    categorySlug: restricted,
    message: `Промокод применён: скидка ${rules.discountPercent}%`,
  };
}
