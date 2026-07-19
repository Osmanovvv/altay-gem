import { describe, expect, it } from 'bun:test';
import { buildAlertMessage, buildNewOrderMessage } from './telegram.service';

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
