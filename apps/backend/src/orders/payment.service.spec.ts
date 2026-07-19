import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';

/**
 * PaymentService (Этап 3, шаг 1): HTTP-обёртка над ЮKassa. Чистая логика уже
 * покрыта yookassa.spec; здесь — поведение сервиса: no-op без ключей, верный
 * запрос с ключами, ошибка вызова → ServiceUnavailable.
 */
const cfg = (vals: Record<string, string>) =>
  ({ get: (k: string, d?: string) => vals[k] ?? d ?? '' }) as unknown as ConfigService;

const input = {
  orderId: 45,
  orderNumber: 'ALT-000045',
  amountKopecks: 26500,
  returnUrl: 'https://altai.example/order/45?token=t',
  customerEmail: null,
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('PaymentService', () => {
  it('без ключей → enabled=false, createPayment вернёт null (заказ без оплаты, не падает)', async () => {
    const s = new PaymentService(cfg({}));
    expect(s.enabled).toBe(false);
    expect(await s.createPayment(input)).toBeNull();
  });

  it('с ключами → POST /payments с Basic-auth, Idempotence-Key по заказу, суммой из копеек', async () => {
    let captured: { url: string; opts: RequestInit } | null = null;
    globalThis.fetch = (async (url: string, opts: RequestInit) => {
      captured = { url, opts };
      return {
        ok: true,
        json: async () => ({
          id: 'pay_1',
          status: 'pending',
          confirmation: { confirmation_url: 'https://pay/redirect' },
        }),
      } as Response;
    }) as typeof fetch;

    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    const r = await s.createPayment(input);

    expect(r).toEqual({
      paymentId: 'pay_1',
      status: 'pending',
      confirmationUrl: 'https://pay/redirect',
    });
    const h = captured!.opts.headers as Record<string, string>;
    expect(captured!.url).toContain('/payments');
    expect(h['Idempotence-Key']).toBe('payment-order-45');
    expect(h.Authorization.startsWith('Basic ')).toBe(true);
    const body = JSON.parse(captured!.opts.body as string);
    expect(body.amount.value).toBe('265.00');
    expect(body.metadata.order_id).toBe('45');
    expect(body.confirmation.return_url).toBe(input.returnUrl);
  });

  it('ЮKassa вернула не-2xx → ServiceUnavailable (покупатель повторит, заказ авто-отменится)', async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 400, text: async () => 'bad request' }) as Response) as typeof fetch;
    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    await expect(s.createPayment(input)).rejects.toThrow();
  });

  it('сеть недоступна (fetch reject) → ServiceUnavailable, не тихая ошибка', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    await expect(s.createPayment(input)).rejects.toThrow();
  });
});

describe('PaymentService.getPayment (шаг 2: авторитетный перезапрос статуса)', () => {
  it('без ключей → null (нечего перезапрашивать)', async () => {
    const s = new PaymentService(cfg({}));
    expect(await s.getPayment('pay_1')).toBeNull();
  });

  it('200 → GET /payments/{id} с Basic-auth, разобранный платёж', async () => {
    let captured: { url: string; opts: RequestInit } | null = null;
    globalThis.fetch = (async (url: string, opts: RequestInit) => {
      captured = { url, opts };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'pay_1',
          status: 'succeeded',
          paid: true,
          amount: { value: '265.00', currency: 'RUB' },
          metadata: { order_id: '45' },
        }),
      } as Response;
    }) as typeof fetch;

    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    const p = await s.getPayment('pay_1');
    expect(p).toEqual({
      id: 'pay_1',
      status: 'succeeded',
      paid: true,
      amountKopecks: 26500,
      metadataOrderId: 45,
    });
    expect(captured!.url).toContain('/payments/pay_1');
    expect((captured!.opts.method ?? 'GET')).toBe('GET');
    const h = captured!.opts.headers as Record<string, string>;
    expect(h.Authorization.startsWith('Basic ')).toBe(true);
  });

  it('404 → null (неизвестный платёж, не ошибка — не зациклить ретраи ЮKassa)', async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 404, text: async () => 'not found' }) as Response) as typeof fetch;
    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    expect(await s.getPayment('nope')).toBeNull();
  });

  it('5xx → ServiceUnavailable (транзиент: пусть ЮKassa повторит вебхук)', async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 500, text: async () => 'oops' }) as Response) as typeof fetch;
    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    await expect(s.getPayment('pay_1')).rejects.toThrow();
  });

  it('сеть недоступна → ServiceUnavailable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    await expect(s.getPayment('pay_1')).rejects.toThrow();
  });
});

describe('PaymentService.createReceipt (шаг 4: отложенный чек POST /receipts)', () => {
  const receipt = {
    type: 'payment' as const,
    payment_id: 'pay_9',
    customer: { email: 'a@b.ru' },
    items: [],
    settlements: [
      { type: 'cashless' as const, amount: { value: '390.00', currency: 'RUB' as const } },
    ],
    send: true,
    timezone: 6,
  };

  it('без ключей → null (фискализация не настроена, не падаем)', async () => {
    const s = new PaymentService(cfg({}));
    expect(await s.createReceipt(45, receipt)).toBeNull();
  });

  it('с ключами → POST /receipts, Idempotence-Key по заказу, тело как есть', async () => {
    let captured: { url: string; opts: RequestInit } | null = null;
    globalThis.fetch = (async (url: string, opts: RequestInit) => {
      captured = { url, opts };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'rc_1', status: 'pending' }),
      } as Response;
    }) as typeof fetch;
    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    const r = await s.createReceipt(45, receipt);
    expect(r).toEqual({ receiptId: 'rc_1', status: 'pending' });
    expect(captured!.url).toContain('/receipts');
    const h = captured!.opts.headers as Record<string, string>;
    // ключ = заказ + хеш тела (исправленный чек уходит новым запросом)
    expect(h['Idempotence-Key'].startsWith('receipt-order-45-')).toBe(true);
    expect(h.Authorization.startsWith('Basic ')).toBe(true);
    expect(JSON.parse(captured!.opts.body as string)).toEqual(receipt);
  });

  it('не-2xx → ServiceUnavailable (кассир повторит фискализацию)', async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 400, text: async () => 'bad' }) as Response) as typeof fetch;
    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    await expect(s.createReceipt(45, receipt)).rejects.toThrow();
  });

  it('ответ без id → ошибка, а не тихий undefined', async () => {
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => ({ status: 'pending' }) }) as Response) as typeof fetch;
    const s = new PaymentService(
      cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' }),
    );
    await expect(s.createReceipt(45, receipt)).rejects.toThrow();
  });
});

describe('фиксы ревью шага 4: идемпотентность чека и статусы', () => {
  const receipt = {
    type: 'payment' as const,
    payment_id: 'pay_9',
    customer: { email: 'a@b.ru' },
    items: [],
    settlements: [
      { type: 'cashless' as const, amount: { value: '390.00', currency: 'RUB' as const } },
    ],
    send: true,
  };
  const keys = () => cfg({ YOOKASSA_SHOP_ID: '111', YOOKASSA_SECRET_KEY: 'sec' });
  const okFetch = (body: unknown) =>
    (async (url: string, opts: RequestInit) => {
      captured.push({ url, opts });
      return { ok: true, status: 200, json: async () => body } as Response;
    }) as typeof fetch;
  let captured: Array<{ url: string; opts: RequestInit }> = [];
  beforeEach(() => {
    captured = [];
  });

  it('Idempotence-Key чека включает ХЕШ тела: то же тело → тот же ключ, изменённое → другой', async () => {
    globalThis.fetch = okFetch({ id: 'rc_1', status: 'pending' });
    const s = new PaymentService(keys());
    await s.createReceipt(45, receipt);
    await s.createReceipt(45, receipt);
    const other = { ...receipt, customer: { email: 'x@y.ru' } };
    await s.createReceipt(45, other);
    const k = captured.map(
      (c) => (c.opts.headers as Record<string, string>)['Idempotence-Key'],
    );
    expect(k[0]).toBe(k[1]); // неизменное тело дедуплицируется
    expect(k[0]).not.toBe(k[2]); // исправленное тело — новый запрос
    expect(k[0].startsWith('receipt-order-45-')).toBe(true);
  });

  it('getReceipt: 200 → {receiptId, status}; 404 → null', async () => {
    globalThis.fetch = okFetch({ id: 'rc_1', status: 'canceled' });
    const s = new PaymentService(keys());
    expect(await s.getReceipt('rc_1')).toEqual({ receiptId: 'rc_1', status: 'canceled' });
    expect(captured[0].url).toContain('/receipts/rc_1');
    globalThis.fetch = (async () =>
      ({ ok: false, status: 404, text: async () => 'nf' }) as Response) as typeof fetch;
    expect(await s.getReceipt('nope')).toBeNull();
  });

  it('findReceiptByPayment: находит уже выбитый чек по payment_id (защита от потерянного ответа)', async () => {
    globalThis.fetch = okFetch({ items: [{ id: 'rc_9', type: 'payment', status: 'succeeded' }] });
    const s = new PaymentService(keys());
    const r = await s.findReceiptByPayment('pay_9');
    expect(r).toEqual({ receiptId: 'rc_9', status: 'succeeded' });
    expect(captured[0].url).toContain('payment_id=pay_9');
    globalThis.fetch = okFetch({ items: [] });
    expect(await s.findReceiptByPayment('pay_9')).toBeNull();
  });

  it('findReceiptByPayment: canceled/refund-чеки НЕ маскируют живой (фильтр по type+status)', async () => {
    globalThis.fetch = okFetch({
      items: [
        { id: 'rc_bad', type: 'payment', status: 'canceled' },
        { id: 'rc_ref', type: 'refund', status: 'succeeded' },
        { id: 'rc_live', type: 'payment', status: 'succeeded' },
      ],
    });
    const s = new PaymentService(keys());
    expect(await s.findReceiptByPayment('pay_9')).toEqual({
      receiptId: 'rc_live',
      status: 'succeeded',
    });
    // только canceled/refund → живого нет
    globalThis.fetch = okFetch({
      items: [{ id: 'rc_bad', type: 'payment', status: 'canceled' }],
    });
    expect(await s.findReceiptByPayment('pay_9')).toBeNull();
  });

  it('соль (захват) в Idempotence-Key: то же тело с новой солью → другой ключ', async () => {
    globalThis.fetch = okFetch({ id: 'rc_1', status: 'pending' });
    const s = new PaymentService(keys());
    await s.createReceipt(45, receipt, 'saltA');
    await s.createReceipt(45, receipt, 'saltA');
    await s.createReceipt(45, receipt, 'saltB');
    const k = captured.map(
      (c) => (c.opts.headers as Record<string, string>)['Idempotence-Key'],
    );
    expect(k[0]).toBe(k[1]);
    expect(k[0]).not.toBe(k[2]);
  });

  it('без ключей getReceipt/findReceiptByPayment → null', async () => {
    const s = new PaymentService(cfg({}));
    expect(await s.getReceipt('rc_1')).toBeNull();
    expect(await s.findReceiptByPayment('pay_9')).toBeNull();
  });
});
