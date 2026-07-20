import { describe, expect, it } from 'bun:test';
import {
  buildPostPaymentReceipt,
  type ReceiptConfig,
} from './receipt';

/**
 * Дизайн B (подтверждён песочницей 20.07): маркированный онлайн-заказ — это
 * ПРЕДОПЛАТА (чек full_prepayment без кодов в момент оплаты), а после сборки —
 * чек ЗАЧЁТА предоплаты с кодами: settlements типом «prepayment», не cashless.
 * Для ремонтной фискализации немаркированного (чек при оплате не ушёл)
 * остаётся дефолт cashless.
 */
const config: ReceiptConfig = { vatCode: 1, paymentMode: 'full_payment' };

const base = {
  lines: [
    {
      description: 'Бальзам',
      priceKopecks: 20000,
      quantity: 2,
      isMarked: true,
      markCodes: ['dm-a', 'dm-b'],
    },
  ],
  discountKopecks: 0,
  deliveryKopecks: 0,
  totalKopecks: 40000,
  customer: { email: 'a@b.ru' },
  config,
  paymentId: 'pay-1',
  timezone: 6,
};

describe('buildPostPaymentReceipt: тип расчёта', () => {
  it('по умолчанию — cashless (безнал на всю сумму)', () => {
    const r = buildPostPaymentReceipt(base);
    expect(r.settlements).toEqual([
      { type: 'cashless', amount: { value: '400.00', currency: 'RUB' } },
    ]);
  });

  it('settlementType prepayment → зачёт предоплаты', () => {
    const r = buildPostPaymentReceipt({ ...base, settlementType: 'prepayment' });
    expect(r.settlements).toEqual([
      { type: 'prepayment', amount: { value: '400.00', currency: 'RUB' } },
    ]);
  });
});
