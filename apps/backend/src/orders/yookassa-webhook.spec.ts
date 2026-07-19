import { describe, expect, it } from 'bun:test';
import {
  clientIpFromXff,
  decidePaymentAction,
  ipAllowed,
  parseWebhookNotification,
  YOOKASSA_WEBHOOK_IPS,
} from './yookassa-webhook';

/**
 * Чистая логика вебхука результата оплаты ЮKassa (Этап 3, шаг 2).
 * Сети/NestJS здесь нет — только разбор уведомления, сверка IP-источника и
 * решение «что делать с заказом». HTTP и БД — в контроллере/OrdersService.
 *
 * Модель верификации ЮKassa (проверено на первоисточнике): HMAC-подписи НЕТ.
 * Надёжность даёт ПЕРЕЗАПРОС платежа из API (авторитетный статус) + IP-allowlist.
 */

describe('parseWebhookNotification', () => {
  const ok = {
    type: 'notification',
    event: 'payment.succeeded',
    object: { id: 'pay_1', status: 'succeeded' },
  };

  it('валидное уведомление → {event, paymentId} из object.id', () => {
    expect(parseWebhookNotification(ok)).toEqual({
      event: 'payment.succeeded',
      paymentId: 'pay_1',
    });
  });

  it('event canceled тоже разбирается', () => {
    expect(
      parseWebhookNotification({ ...ok, event: 'payment.canceled' }).event,
    ).toBe('payment.canceled');
  });

  it('нет object.id → бросает (не глотаем молча)', () => {
    expect(() =>
      parseWebhookNotification({ event: 'payment.succeeded', object: {} }),
    ).toThrow();
  });

  it('нет event → бросает', () => {
    expect(() =>
      parseWebhookNotification({ object: { id: 'pay_1' } }),
    ).toThrow();
  });

  it('object не объект → бросает', () => {
    expect(() =>
      parseWebhookNotification({ event: 'payment.succeeded', object: 'x' }),
    ).toThrow();
  });

  it('тело не объект → бросает', () => {
    expect(() => parseWebhookNotification('garbage')).toThrow();
    expect(() => parseWebhookNotification(null)).toThrow();
  });
});

describe('ipAllowed (список IP ЮKassa)', () => {
  it('IP из диапазона 185.71.76.0/27 разрешён (границы .0 и .31)', () => {
    expect(ipAllowed('185.71.76.0')).toBe(true);
    expect(ipAllowed('185.71.76.5')).toBe(true);
    expect(ipAllowed('185.71.76.31')).toBe(true);
  });

  it('IP сразу за диапазоном /27 запрещён (.32)', () => {
    expect(ipAllowed('185.71.76.32')).toBe(false);
  });

  it('точечный IP 77.75.156.11 разрешён, соседний — нет', () => {
    expect(ipAllowed('77.75.156.11')).toBe(true);
    expect(ipAllowed('77.75.156.12')).toBe(false);
  });

  it('диапазон 77.75.154.128/25 — .128 внутри, .127 снаружи', () => {
    expect(ipAllowed('77.75.154.200')).toBe(true);
    expect(ipAllowed('77.75.154.127')).toBe(false);
  });

  it('чужой публичный IP запрещён', () => {
    expect(ipAllowed('8.8.8.8')).toBe(false);
    expect(ipAllowed('127.0.0.1')).toBe(false);
  });

  it('IPv4-mapped IPv6 (::ffff:185.71.76.5) разбирается как IPv4', () => {
    expect(ipAllowed('::ffff:185.71.76.5')).toBe(true);
    expect(ipAllowed('::ffff:8.8.8.8')).toBe(false);
  });

  it('IPv6 из 2a02:5180::/32 разрешён, соседний префикс — нет', () => {
    expect(ipAllowed('2a02:5180:1234:5678::1')).toBe(true);
    expect(ipAllowed('2a02:5181::1')).toBe(false);
    expect(ipAllowed('2a03:5180::1')).toBe(false);
  });

  it('мусор → false, не бросает', () => {
    expect(ipAllowed('garbage')).toBe(false);
    expect(ipAllowed('')).toBe(false);
    expect(ipAllowed('999.1.1.1')).toBe(false);
  });

  it('пользовательский allowlist переопределяет дефолт', () => {
    expect(ipAllowed('10.0.0.5', ['10.0.0.0/24'])).toBe(true);
    expect(ipAllowed('185.71.76.5', ['10.0.0.0/24'])).toBe(false);
  });

  it('дефолтный список — ровно 7 записей ЮKassa', () => {
    expect(YOOKASSA_WEBHOOK_IPS).toHaveLength(7);
  });
});

describe('clientIpFromXff (реальный IP из X-Forwarded-For)', () => {
  // nginx добавляет реального пира (ЮKassa) ПОСЛЕДНИМ ($proxy_add_x_forwarded_for),
  // а клиентские значения слева подделываемы → берём ПРАВЫЙ элемент.
  it('берёт правый IP из цепочки', () => {
    expect(clientIpFromXff('1.2.3.4, 77.75.156.11', 'fb')).toBe('77.75.156.11');
  });

  it('один IP с пробелами → он и есть', () => {
    expect(clientIpFromXff('  77.75.156.11  ', 'fb')).toBe('77.75.156.11');
  });

  it('пусто/undefined → fallback (req.ip)', () => {
    expect(clientIpFromXff(undefined, '9.9.9.9')).toBe('9.9.9.9');
    expect(clientIpFromXff('', '9.9.9.9')).toBe('9.9.9.9');
    expect(clientIpFromXff('  ,  ', '9.9.9.9')).toBe('9.9.9.9');
  });

  it('подделка слева не проходит: правый = реальный пир', () => {
    // атакующий шлёт X-Forwarded-For: 77.75.156.11; nginx допишет его IP справа
    expect(clientIpFromXff('77.75.156.11, 203.0.113.7', 'fb')).toBe(
      '203.0.113.7',
    );
  });
});

describe('decidePaymentAction', () => {
  const base = {
    paymentStatus: 'succeeded',
    paid: true,
    paidKopecks: 26500,
    expectedKopecks: 26500,
    orderStatus: 'awaiting_payment',
  };

  it('оплачен, сумма совпала, заказ ждёт оплату → mark_paid', () => {
    expect(decidePaymentAction(base)).toEqual({
      action: 'mark_paid',
      reason: 'succeeded',
      alert: false,
    });
  });

  it('сумма НЕ совпала → ignore + alert (никогда не платим по чужой сумме)', () => {
    const d = decidePaymentAction({ ...base, paidKopecks: 100 });
    expect(d.action).toBe('ignore');
    expect(d.reason).toBe('amount_mismatch');
    expect(d.alert).toBe(true);
  });

  it('succeeded, но paid=false → ignore, без действия', () => {
    expect(decidePaymentAction({ ...base, paid: false }).action).toBe('ignore');
  });

  it('повтор succeeded по уже оплаченному заказу → ignore/already_paid (идемпотентно)', () => {
    const d = decidePaymentAction({ ...base, orderStatus: 'paid' });
    expect(d.action).toBe('ignore');
    expect(d.reason).toBe('already_paid');
    expect(d.alert).toBe(false);
  });

  it('деньги пришли, а заказ уже отменён (автоотмена) → ignore + alert (нужен возврат)', () => {
    const d = decidePaymentAction({ ...base, orderStatus: 'cancelled' });
    expect(d.action).toBe('ignore');
    expect(d.reason).toBe('paid_but_cancelled');
    expect(d.alert).toBe(true);
  });

  it('canceled по заказу в ожидании → cancel (освободить резерв)', () => {
    const d = decidePaymentAction({
      ...base,
      paymentStatus: 'canceled',
      paid: false,
    });
    expect(d.action).toBe('cancel');
    expect(d.reason).toBe('canceled');
  });

  it('canceled по уже оплаченному заказу → ignore (не трогаем оплаченный)', () => {
    const d = decidePaymentAction({
      ...base,
      paymentStatus: 'canceled',
      paid: false,
      orderStatus: 'paid',
    });
    expect(d.action).toBe('ignore');
  });

  it('промежуточный статус (waiting_for_capture/pending) → ignore', () => {
    expect(
      decidePaymentAction({ ...base, paymentStatus: 'waiting_for_capture' })
        .action,
    ).toBe('ignore');
    expect(
      decidePaymentAction({ ...base, paymentStatus: 'pending', paid: false })
        .action,
    ).toBe('ignore');
  });
});
