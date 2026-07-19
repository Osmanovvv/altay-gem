import { describe, expect, it } from 'bun:test';
import {
  buildPaymentRequest,
  formatAmount,
  parsePaymentObject,
  parsePaymentResponse,
  yooKassaAuthHeader,
} from './yookassa';

/**
 * Чистая логика интеграции с ЮKassa (Этап 3, шаг 1: создание платежа).
 * Сеть и NestJS здесь не участвуют — только сборка запроса и разбор ответа,
 * чтобы контракт с ЮKassa был покрыт тестами без песочницы.
 */

describe('formatAmount', () => {
  it('копейки → строка с двумя знаками (требование ЮKassa)', () => {
    expect(formatAmount(100000)).toBe('1000.00');
    expect(formatAmount(15050)).toBe('150.50');
    expect(formatAmount(1)).toBe('0.01');
    expect(formatAmount(0)).toBe('0.00');
  });
  it('не даёт плавающих хвостов (0.1+0.2)', () => {
    expect(formatAmount(15710)).toBe('157.10'); // цена Сметаны из прода
  });
});

describe('yooKassaAuthHeader', () => {
  it('Basic base64(shopId:secretKey)', () => {
    const h = yooKassaAuthHeader('123456', 'test_secret');
    expect(h).toBe('Basic ' + Buffer.from('123456:test_secret').toString('base64'));
    expect(h.startsWith('Basic ')).toBe(true);
  });
});

describe('buildPaymentRequest', () => {
  const input = {
    orderId: 45,
    orderNumber: 'ALT-000045',
    amountKopecks: 26500,
    returnUrl: 'https://altai.example/order/45?token=abc',
    customerEmail: 'buyer@example.com',
  };

  it('сумма из копеек, валюта RUB, одностадийный захват', () => {
    const r = buildPaymentRequest(input);
    expect(r.amount).toEqual({ value: '265.00', currency: 'RUB' });
    expect(r.capture).toBe(true);
  });

  it('confirmation = redirect с нашим return_url', () => {
    const r = buildPaymentRequest(input);
    expect(r.confirmation).toEqual({
      type: 'redirect',
      return_url: 'https://altai.example/order/45?token=abc',
    });
  });

  it('metadata.order_id связывает платёж с заказом (для вебхука шага 2)', () => {
    expect(buildPaymentRequest(input).metadata).toEqual({ order_id: '45' });
  });

  it('описание содержит номер заказа', () => {
    expect(buildPaymentRequest(input).description).toContain('ALT-000045');
  });

  it('без e-mail поле чека не добавляется (фискализация — отдельный шаг)', () => {
    const r = buildPaymentRequest({ ...input, customerEmail: null });
    expect('receipt' in r).toBe(false);
  });
});

describe('parsePaymentResponse', () => {
  const ok = {
    id: '2f9e8d7c-0000-5000-a000-000000000001',
    status: 'pending',
    paid: false,
    confirmation: {
      type: 'redirect',
      confirmation_url: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=xxx',
    },
  };

  it('вытаскивает id, статус и ссылку подтверждения', () => {
    expect(parsePaymentResponse(ok)).toEqual({
      paymentId: '2f9e8d7c-0000-5000-a000-000000000001',
      status: 'pending',
      confirmationUrl: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=xxx',
    });
  });

  it('нет confirmation_url → ошибка (нечего показывать покупателю)', () => {
    expect(() => parsePaymentResponse({ id: 'x', status: 'pending' })).toThrow();
  });

  it('нет id → ошибка (нечем связать с заказом)', () => {
    expect(() =>
      parsePaymentResponse({ status: 'pending', confirmation: ok.confirmation }),
    ).toThrow();
  });

  it('мусор вместо объекта → ошибка, а не тихий undefined', () => {
    expect(() => parsePaymentResponse(null)).toThrow();
    expect(() => parsePaymentResponse('oops')).toThrow();
  });
});

describe('parsePaymentObject (шаг 2: авторитетный платёж из перезапроса)', () => {
  const full = {
    id: 'pay_1',
    status: 'succeeded',
    paid: true,
    amount: { value: '265.00', currency: 'RUB' },
    metadata: { order_id: '45' },
  };

  it('полный объект → {id,status,paid,amountKopecks,metadataOrderId}', () => {
    expect(parsePaymentObject(full)).toEqual({
      id: 'pay_1',
      status: 'succeeded',
      paid: true,
      amountKopecks: 26500,
      metadataOrderId: 45,
    });
  });

  it('копейки из value: точный разбор без плавающего хвоста', () => {
    expect(parsePaymentObject({ ...full, amount: { value: '265.50' } }).amountKopecks).toBe(26550);
    expect(parsePaymentObject({ ...full, amount: { value: '265.05' } }).amountKopecks).toBe(26505);
    expect(parsePaymentObject({ ...full, amount: { value: '1000.00' } }).amountKopecks).toBe(100000);
    expect(parsePaymentObject({ ...full, amount: { value: '0.01' } }).amountKopecks).toBe(1);
  });

  it('нет metadata / нечисловой order_id → metadataOrderId=null', () => {
    const noMeta = { id: full.id, status: full.status, paid: full.paid, amount: full.amount };
    expect(parsePaymentObject(noMeta).metadataOrderId).toBeNull();
    expect(parsePaymentObject({ ...full, metadata: { order_id: 'x' } }).metadataOrderId).toBeNull();
  });

  it('paid отсутствует → false (не считаем оплаченным по умолчанию)', () => {
    const noPaid = { id: full.id, status: full.status, amount: full.amount, metadata: full.metadata };
    expect(parsePaymentObject(noPaid).paid).toBe(false);
  });

  it('нет id/status/amount.value → бросает, а не тихий undefined', () => {
    expect(() => parsePaymentObject({ ...full, id: undefined })).toThrow();
    expect(() => parsePaymentObject({ ...full, status: undefined })).toThrow();
    expect(() => parsePaymentObject({ ...full, amount: {} })).toThrow();
    expect(() => parsePaymentObject(null)).toThrow();
  });
});

describe('buildPaymentRequest — чек 54-ФЗ (шаг 3)', () => {
  const base = {
    orderId: 7,
    orderNumber: 'ALT-000007',
    amountKopecks: 50000,
    returnUrl: 'https://a/order/7',
  };
  const receipt = {
    customer: { email: 'a@b.ru' },
    items: [
      {
        description: 'Мёд',
        quantity: '2',
        amount: { value: '250.00', currency: 'RUB' as const },
        vat_code: 1,
        payment_subject: 'commodity',
        payment_mode: 'full_payment',
      },
    ],
  };

  it('receipt передан → входит в тело запроса', () => {
    expect(buildPaymentRequest({ ...base, receipt }).receipt).toEqual(receipt);
  });

  it('receipt не передан → поля receipt нет', () => {
    expect('receipt' in buildPaymentRequest(base)).toBe(false);
  });
});
