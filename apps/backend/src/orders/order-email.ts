/**
 * Письмо-подтверждение заказа покупателю (запрос ПМ: «дублировать заказ на
 * почту»). Чистая функция без I/O — отправкой занимается MailerService.
 *
 * Письмо уходит В МОМЕНТ СОЗДАНИЯ заказа, поэтому оно же служит «квитанцией»
 * и для неоплаченного онлайн-заказа: там показываем ссылку на оплату, иначе
 * покупатель, закрывший вкладку ЮKassa, теряет заказ из виду.
 * Фискальный чек 54-ФЗ это письмо НЕ заменяет — его шлёт ЮKassa отдельно.
 */

export interface OrderEmailItem {
  name: string;
  quantity: number;
  unit: string;
  sumRub: number;
}

export interface OrderEmailInput {
  orderNumber: string;
  orderUrl: string;
  customerName: string;
  /** Онлайн-заказ ещё не оплачен — зовём оплатить. */
  needsPayment: boolean;
  paymentUrl: string | null;
  /** Готовая строка «Самовывоз: адрес» / «Доставка курьером…». */
  deliveryLabel: string;
  items: OrderEmailItem[];
  subtotalRub: number;
  discountRub: number;
  deliveryRub: number;
  totalRub: number;
}

/** 1491 → «1 491» (узкий неразрывный пробел, как на витрине). */
function money(rub: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(rub));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildOrderEmail(input: OrderEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Заказ ${input.orderNumber} принят — Жемчужина Алтая`;
  const greeting = input.customerName.trim()
    ? `${input.customerName.trim()}, спасибо за заказ!`
    : 'Спасибо за заказ!';

  const lines: string[] = [];
  lines.push(greeting);
  lines.push('');
  lines.push(`Номер заказа: ${input.orderNumber}`);
  lines.push(input.deliveryLabel);
  lines.push('');
  lines.push('Состав заказа:');
  for (const i of input.items) {
    lines.push(`  • ${i.name} — ${i.quantity} ${i.unit} — ${money(i.sumRub)} ₽`);
  }
  lines.push('');
  lines.push(`Товары: ${money(input.subtotalRub)} ₽`);
  if (input.discountRub > 0) lines.push(`Скидка: −${money(input.discountRub)} ₽`);
  lines.push(
    `Доставка: ${input.deliveryRub > 0 ? `${money(input.deliveryRub)} ₽` : 'Бесплатно'}`,
  );
  lines.push(`Итого: ${money(input.totalRub)} ₽`);
  lines.push('');
  if (input.needsPayment && input.paymentUrl) {
    lines.push('Заказ ждёт оплаты.');
    lines.push(`Оплатить заказ: ${input.paymentUrl}`);
  } else if (input.needsPayment) {
    lines.push('Заказ ждёт оплаты — ссылка на оплату на странице заказа.');
  } else {
    lines.push('Оплата при получении.');
  }
  lines.push(`Статус заказа: ${input.orderUrl}`);
  lines.push('');
  lines.push('С уважением, «Жемчужина Алтая»');
  const text = lines.join('\n');

  const rows = input.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;color:#1f1a0e">${escapeHtml(i.name)} × ${i.quantity} ${escapeHtml(i.unit)}</td>` +
        `<td style="padding:6px 0;text-align:right;white-space:nowrap;color:#1f1a0e">${money(i.sumRub)} ₽</td></tr>`,
    )
    .join('');

  const payBlock =
    input.needsPayment && input.paymentUrl
      ? `<p style="margin:18px 0"><a href="${escapeHtml(input.paymentUrl)}" style="display:inline-block;background:#c8963e;color:#1f1a0e;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Оплатить заказ</a></p>`
      : input.needsPayment
        ? '<p style="margin:18px 0;color:#6b6355">Заказ ждёт оплаты — ссылка на оплату на странице заказа.</p>'
        : '<p style="margin:18px 0;color:#6b6355">Оплата при получении.</p>';

  const html = `<!doctype html>
<html lang="ru"><body style="margin:0;padding:24px;background:#faf7f2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 4px;font-size:22px;color:#1f1a0e">Заказ ${escapeHtml(input.orderNumber)} принят</h1>
    <p style="margin:0 0 18px;color:#6b6355">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 18px;color:#1f1a0e">${escapeHtml(input.deliveryLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    <hr style="border:0;border-top:1px solid rgba(31,26,14,.12);margin:16px 0">
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#6b6355">
      <tr><td>Товары</td><td style="text-align:right">${money(input.subtotalRub)} ₽</td></tr>
      ${input.discountRub > 0 ? `<tr><td>Скидка</td><td style="text-align:right">−${money(input.discountRub)} ₽</td></tr>` : ''}
      <tr><td>Доставка</td><td style="text-align:right">${input.deliveryRub > 0 ? `${money(input.deliveryRub)} ₽` : 'Бесплатно'}</td></tr>
      <tr><td style="padding-top:8px;font-size:16px;color:#1f1a0e"><strong>Итого</strong></td>
          <td style="padding-top:8px;text-align:right;font-size:16px;color:#c8963e"><strong>${money(input.totalRub)} ₽</strong></td></tr>
    </table>
    ${payBlock}
    <p style="margin:18px 0 0;font-size:13px"><a href="${escapeHtml(input.orderUrl)}" style="color:#a67c2e">Статус заказа</a></p>
    <p style="margin:22px 0 0;font-size:12px;color:#9a9384">С уважением, «Жемчужина Алтая»</p>
  </div>
</body></html>`;

  return { subject, text, html };
}
