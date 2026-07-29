import { describe, expect, test } from 'bun:test';
import { buildOrderEmail, type OrderEmailInput } from './order-email';

/**
 * Письмо-подтверждение покупателю (запрос ПМ: «дублировать заказ на почту»).
 * Проверяем не вёрстку, а то, за что письмо отвечает: покупатель должен из
 * него понять — что заказал, на сколько, где забирать и надо ли платить.
 */
const base: OrderEmailInput = {
  orderNumber: 'ALT-000051',
  orderUrl: 'https://ecomarket-altai.ru/order/51?token=abc',
  customerName: 'Иван',
  needsPayment: false,
  paymentUrl: null,
  deliveryLabel: 'Самовывоз: г. Новосибирск, ул. Ленинградская 75/2',
  items: [
    { name: 'Пантогематоген 250 мл.', quantity: 1, unit: 'шт', sumRub: 1260 },
    { name: 'Сыр Граф Монте Кристо', quantity: 3, unit: 'порция 100 г', sumRub: 357 },
  ],
  subtotalRub: 1617,
  discountRub: 126,
  deliveryRub: 0,
  totalRub: 1491,
};

describe('buildOrderEmail', () => {
  test('тема содержит номер заказа', () => {
    const { subject } = buildOrderEmail(base);
    expect(subject).toContain('ALT-000051');
  });

  test('в тексте есть состав, суммы и способ получения', () => {
    const { text } = buildOrderEmail(base);
    expect(text).toContain('Пантогематоген 250 мл.');
    expect(text).toContain('Сыр Граф Монте Кристо');
    expect(text).toContain('3 порция 100 г');
    expect(text).toContain('Ленинградская 75/2');
    // Intl разделяет разряды НЕразрывным пробелом — сравниваем нормализованно.
    expect(text.replace(/ /g, ' ')).toContain('1 491');
    expect(text).toContain('126'); // скидка
    expect(text).toContain('Бесплатно'); // доставка 0
  });

  test('ссылка на страницу заказа есть и в тексте, и в HTML', () => {
    const { text, html } = buildOrderEmail(base);
    expect(text).toContain(base.orderUrl);
    expect(html).toContain(base.orderUrl);
  });

  test('заказ с оплатой при получении: про оплату не зовём, но напоминаем', () => {
    const { text } = buildOrderEmail(base);
    expect(text).toMatch(/оплат[аи] при получении|оплатите при получении/i);
    expect(text).not.toContain('Оплатить заказ:');
  });

  test('неоплаченный онлайн-заказ: письмо зовёт оплатить и даёт ссылку', () => {
    const { subject, text } = buildOrderEmail({
      ...base,
      needsPayment: true,
      paymentUrl: 'https://yoomoney.ru/checkout/payments/v2/abc',
    });
    expect(subject).toContain('ALT-000051');
    expect(text).toContain('Оплатить заказ:');
    expect(text).toContain('https://yoomoney.ru/checkout/payments/v2/abc');
  });

  test('без скидки строка скидки не печатается', () => {
    const { text } = buildOrderEmail({ ...base, discountRub: 0, totalRub: 1617 });
    expect(text).not.toContain('Скидка');
  });

  test('платная доставка печатается суммой', () => {
    const { text } = buildOrderEmail({
      ...base,
      deliveryLabel: 'Доставка курьером по Новосибирску',
      deliveryRub: 300,
      totalRub: 1791,
    });
    expect(text).toContain('300');
    expect(text).not.toContain('Бесплатно');
  });

  test('HTML экранирует пользовательские данные (защита от подстановки тегов)', () => {
    const { html } = buildOrderEmail({
      ...base,
      customerName: '<script>alert(1)</script>',
      items: [{ name: 'Товар <b>жирный</b>', quantity: 1, unit: 'шт', sumRub: 100 }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Товар &lt;b&gt;жирный&lt;/b&gt;');
  });

  test('имя покупателя используется в приветствии, пустое — без сбоя', () => {
    expect(buildOrderEmail(base).text).toContain('Иван');
    const noName = buildOrderEmail({ ...base, customerName: '' });
    expect(noName.text).toContain('ALT-000051');
  });
});
