import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'bun:test';
import type { StrapiService } from '../strapi/strapi.service';
import {
  buildAlertMessage,
  buildNewOrderMessage,
  buildOrderAdminUrl,
  TelegramService,
} from './telegram.service';

describe('buildNewOrderMessage', () => {
  const base = {
    id: 42,
    orderNumber: 'ALT-000042',
    customerName: 'Иван Тестов',
    customerPhone: '+79990001122',
    deliveryMethod: 'pickup_leningradskaya',
    items: [
      { name: 'Мёд донниковый', quantity: 2 },
      { name: 'Чай таёжный', quantity: 1 },
    ],
    totalRub: 1780,
    source: 'web',
  };

  it('содержит номер, контакт, точку самовывоза, позиции и итог', () => {
    const t = buildNewOrderMessage(base);
    expect(t).toContain('ALT-000042');
    expect(t).toContain('Иван Тестов, +79990001122');
    expect(t).toContain('Самовывоз — Ленинградская 75/2');
    expect(t).toContain('• Мёд донниковый × 2');
    expect(t).toContain('1 780 ₽'); // ru-RU разделитель тысяч — неразрывный пробел
  });

  it('адрес доставки добавляется, если есть', () => {
    const t = buildNewOrderMessage({
      ...base,
      deliveryMethod: 'courier_nsk',
      deliveryAddress: 'ул. Мира 5',
    });
    expect(t).toContain('Курьер по Новосибирску');
    expect(t).toContain('Адрес: ул. Мира 5');
  });

  it('экранирует HTML-спецсимволы в данных покупателя', () => {
    const t = buildNewOrderMessage({
      ...base,
      customerName: '<b>hack</b> & co',
    });
    expect(t).toContain('&lt;b&gt;hack&lt;/b&gt; &amp; co');
    expect(t).not.toContain('<b>hack</b>');
  });

  it('источник MAX отмечается', () => {
    expect(buildNewOrderMessage({ ...base, source: 'max' })).toContain(
      'Источник: MAX',
    );
  });
});

describe('buildAlertMessage', () => {
  it('содержит маркер тревоги и тему', () => {
    const t = buildAlertMessage('Ночная сверка не прошла');
    expect(t).toContain('🚨');
    expect(t).toContain('Ночная сверка не прошла');
  });

  it('деталь добавляется отдельной строкой, если есть', () => {
    const t = buildAlertMessage('Сбой', 'магазин X: файл не найден');
    expect(t).toContain('Сбой');
    expect(t).toContain('магазин X: файл не найден');
    expect(t.split('\n').length).toBeGreaterThanOrEqual(2);
  });

  it('экранирует HTML в теме и детали', () => {
    const t = buildAlertMessage('<b>x</b>', 'a & b < c');
    expect(t).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(t).toContain('a &amp; b &lt; c');
    expect(t).not.toContain('<b>x</b>');
  });
});

describe('buildOrderAdminUrl', () => {
  it('добавляет ?order=<id> к URL плагина заказов Strapi (с хвостовым / и без)', () => {
    expect(
      buildOrderAdminUrl('https://admin.example.com/panel/plugins/orders', 42),
    ).toBe('https://admin.example.com/panel/plugins/orders?order=42');
    expect(
      buildOrderAdminUrl(' https://admin.example.com/panel/plugins/orders/// ', 7),
    ).toBe('https://admin.example.com/panel/plugins/orders?order=7');
  });

  it('сохраняет существующие query-параметры', () => {
    expect(
      buildOrderAdminUrl(
        'https://admin.example.com/panel/plugins/orders?tab=orders',
        15,
      ),
    ).toBe('https://admin.example.com/panel/plugins/orders?tab=orders&order=15');
  });

  it('возвращает null при пустом, невалидном URL или некорректном id', () => {
    expect(buildOrderAdminUrl(undefined, 42)).toBeNull();
    expect(buildOrderAdminUrl('', 42)).toBeNull();
    expect(buildOrderAdminUrl('not-a-url', 42)).toBeNull();
    expect(buildOrderAdminUrl('javascript:alert(1)', 42)).toBeNull();
    expect(buildOrderAdminUrl('https://admin.example.com/panel/plugins/orders', 0)).toBeNull();
    expect(buildOrderAdminUrl('https://admin.example.com/panel/plugins/orders', -5)).toBeNull();
    expect(buildOrderAdminUrl('https://admin.example.com/panel/plugins/orders', 1.5)).toBeNull();
  });
});

describe('TelegramService.notifyNewOrder', () => {
  const sampleOrder = {
    id: 42,
    orderNumber: 'ALT-000042',
    customerName: 'Иван Тестов',
    customerPhone: '+79990001122',
    deliveryMethod: 'pickup_leningradskaya',
    items: [{ name: 'Мёд донниковый', quantity: 2 }],
    totalRub: 1780,
    source: 'web',
  };

  it('отправляет кнопку «Открыть заказ» на ADMIN_ORDERS_URL', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;

    try {
      const svc = new TelegramService(
        new ConfigService({
          TELEGRAM_BOT_TOKEN: 'bot-token',
          TELEGRAM_ADMIN_CHAT_ID: '12345',
          PUBLIC_SITE_URL: 'https://ecomarket-altai.ru',
          ADMIN_ORDERS_URL: 'https://admin.example.com/panel/plugins/orders/',
        }),
        { notificationRecipients: async () => [] } as unknown as StrapiService,
      );
      await svc.notifyNewOrder(sampleOrder);
      expect(sent).toHaveLength(1);
      expect(sent[0].reply_markup).toEqual({
        inline_keyboard: [
          [
            {
              text: 'Открыть заказ',
              url: 'https://admin.example.com/panel/plugins/orders?order=42',
            },
          ],
        ],
      });
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('не добавляет мёртвую ссылку /admin?order=, если ADMIN_ORDERS_URL не задан', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;

    try {
      const svc = new TelegramService(
        new ConfigService({
          TELEGRAM_BOT_TOKEN: 'bot-token',
          TELEGRAM_ADMIN_CHAT_ID: '12345',
          PUBLIC_SITE_URL: 'https://ecomarket-altai.ru',
        }),
        { notificationRecipients: async () => [] } as unknown as StrapiService,
      );
      await svc.notifyNewOrder(sampleOrder);
      expect(sent).toHaveLength(1);
      expect('reply_markup' in sent[0]).toBe(false);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});
