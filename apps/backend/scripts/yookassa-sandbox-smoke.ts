/**
 * Смоук ПЕСОЧНИЦЫ ЮKassa (Этап 3): наши билдеры платежа/чека против ЖИВОГО API.
 * Первый выход кода в реальный API — до этого всё проверялось на моках.
 *
 * Запуск (из apps/backend, ключи ТЕСТОВОГО магазина — деньги не двигаются):
 *   YOOKASSA_SHOP_ID=1415316 YOOKASSA_SECRET_KEY=test_... bun run scripts/yookassa-sandbox-smoke.ts <команда>
 *
 * Команды:
 *   smoke                — создать 2 платежа: (1) с чеком, где доставка с
 *                          float-хвостом 300.03 ₽ (проверка квантования копеек);
 *                          (2) без чека — «маркированный» поток (чек после сборки).
 *   status <payment_id>  — статус платежа (после оплаты тестовой картой).
 *   receipt <payment_id> — отложенный чек POST /receipts с кодами маркировки
 *                          (mark_code_info.gs_1m) по УЖЕ оплаченному платежу.
 *
 * Защита: секретный ключ обязан начинаться с test_ — боевой скрипт не примет.
 */
import { randomUUID } from 'node:crypto';
import {
  buildPostPaymentReceipt,
  buildReceipt,
  type ReceiptConfig,
} from '../src/orders/receipt';
import {
  buildPaymentRequest,
  formatAmount,
  yooKassaAuthHeader,
} from '../src/orders/yookassa';

const SHOP_ID = process.env.YOOKASSA_SHOP_ID ?? '';
const SECRET = process.env.YOOKASSA_SECRET_KEY ?? '';
const API = process.env.YOOKASSA_API_BASE ?? 'https://api.yookassa.ru/v3';

if (!SHOP_ID || !SECRET) {
  console.error('Нужны YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY (тестовые).');
  process.exit(2);
}
if (!SECRET.startsWith('test_')) {
  console.error('СТОП: ключ не тестовый (нет префикса test_) — смоук по боевому магазину запрещён.');
  process.exit(2);
}

const config: ReceiptConfig = {
  vatCode: 1, // «Без НДС» (УСН) — для песочницы; боевое значение подтверждает бухгалтер
  paymentMode: 'full_payment',
  measure: 'piece',
};

async function api(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: yooKassaAuthHeader(SHOP_ID, SECRET),
      'Content-Type': 'application/json',
      ...(method === 'POST' ? { 'Idempotence-Key': randomUUID() } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

function show(label: string, status: number, json: Record<string, unknown>) {
  const ok = status >= 200 && status < 300;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  [HTTP ${status}]`);
  if (!ok) console.log(JSON.stringify(json, null, 2));
  return ok;
}

// Тестовые «сырые» коды Data Matrix (GS1: 01+GTIN, 21+серия, GS, 93+крипто).
const GS = '';
const fakeCode = (n: number) =>
  `010460372100123421sn${n}test${GS}93dGVz`;

const cmd = process.argv[2] ?? 'smoke';

if (cmd === 'smoke') {
  // --- 1. платёж С ЧЕКОМ: товар 100 ₽ + доставка 300.03 ₽ (float-хвост) ---
  const deliveryKopecks = 300.03 * 100; // 30003.000000000004 — как из Strapi decimal
  const totalKopecks = 10000 + deliveryKopecks;
  const receipt = buildReceipt({
    lines: [{ description: 'Мёд горный (смоук)', priceKopecks: 10000, quantity: 1 }],
    discountKopecks: 0,
    deliveryKopecks,
    totalKopecks,
    customer: { email: 'sandbox-smoke@example.com' },
    config,
  });
  const req1 = buildPaymentRequest({
    orderId: 900001,
    orderNumber: 'SMOKE-1',
    amountKopecks: Math.round(totalKopecks),
    returnUrl: 'https://ecomarket-altai.ru/order/900001?token=smoke',
    customerEmail: 'sandbox-smoke@example.com',
    receipt,
  });
  const r1 = await api('POST', '/payments', req1);
  const ok1 = show('платёж №1 (обычный чек, дробная доставка 300.03) создан', r1.status, r1.json);
  if (ok1) {
    console.log(`  id: ${r1.json.id}`);
    console.log(`  оплатить: ${(r1.json.confirmation as { confirmation_url?: string })?.confirmation_url}`);
  }

  // --- 2. платёж БЕЗ чека — «маркированный» поток (чек уйдёт после сборки) ---
  const req2 = buildPaymentRequest({
    orderId: 900002,
    orderNumber: 'SMOKE-2-MARKED',
    amountKopecks: 40000, // 2 × 200 ₽ маркированных
    returnUrl: 'https://ecomarket-altai.ru/order/900002?token=smoke',
    customerEmail: 'sandbox-smoke@example.com',
  });
  const r2 = await api('POST', '/payments', req2);
  const ok2 = show('платёж №2 (маркированный, БЕЗ чека при оплате) создан', r2.status, r2.json);
  if (ok2) {
    console.log(`  id: ${r2.json.id}`);
    console.log(`  оплатить: ${(r2.json.confirmation as { confirmation_url?: string })?.confirmation_url}`);
  }
  process.exit(ok1 && ok2 ? 0 : 1);
}

if (cmd === 'status') {
  const id = process.argv[3];
  if (!id) { console.error('нужен payment_id'); process.exit(2); }
  const r = await api('GET', `/payments/${id}`);
  show(`статус платежа ${id}`, r.status, r.json);
  console.log(`  status: ${r.json.status}, paid: ${r.json.paid}`);
  process.exit(0);
}

if (cmd === 'receipt') {
  const id = process.argv[3];
  if (!id) { console.error('нужен payment_id (оплаченный)'); process.exit(2); }
  // Отложенный чек: 2 единицы маркированного по 200 ₽, каждой — свой gs_1m.
  const post = buildPostPaymentReceipt({
    lines: [
      {
        description: 'Бальзам маркированный (смоук)',
        priceKopecks: 20000,
        quantity: 2,
        isMarked: true,
        markCodes: [fakeCode(1), fakeCode(2)],
      },
    ],
    discountKopecks: 0,
    deliveryKopecks: 0,
    totalKopecks: 40000,
    customer: { email: 'sandbox-smoke@example.com' },
    config,
    paymentId: id,
    timezone: 6, // Новосибирск
  });
  const r = await api('POST', '/receipts', post);
  const ok = show('отложенный чек с mark_code_info.gs_1m принят', r.status, r.json);
  if (ok) console.log(`  receipt id: ${r.json.id}, status: ${r.json.status}`);
  process.exit(ok ? 0 : 1);
}

if (cmd === 'prepay') {
  // Дизайн B (режим магазина «Принимать платёж», дефолт): маркированный заказ =
  // чек ПРЕДОПЛАТЫ при платеже (payment_mode full_prepayment, БЕЗ кодов) +
  // после сборки чек ЗАЧЁТА предоплаты с кодами (settlements: prepayment).
  const prepayConfig: ReceiptConfig = {
    vatCode: 1,
    paymentMode: 'full_prepayment',
    measure: 'piece',
  };
  const receipt = buildReceipt({
    lines: [
      {
        description: 'Бальзам маркированный (предоплата, без кодов)',
        priceKopecks: 20000,
        quantity: 2,
        // в чеке ПРЕДОПЛАТЫ коды не передаются — товар ещё не передан
      },
    ],
    discountKopecks: 0,
    deliveryKopecks: 0,
    totalKopecks: 40000,
    customer: { email: 'sandbox-smoke@example.com' },
    config: prepayConfig,
  });
  const req = buildPaymentRequest({
    orderId: 900003,
    orderNumber: 'SMOKE-3-PREPAY',
    amountKopecks: 40000,
    returnUrl: 'https://ecomarket-altai.ru/order/900003?token=smoke',
    customerEmail: 'sandbox-smoke@example.com',
    receipt,
  });
  const r = await api('POST', '/payments', req);
  const ok = show('платёж с чеком ПРЕДОПЛАТЫ (маркир. строка без кодов) создан', r.status, r.json);
  if (ok) {
    console.log(`  id: ${r.json.id}`);
    console.log(`  оплатить: ${(r.json.confirmation as { confirmation_url?: string })?.confirmation_url}`);
  }
  process.exit(ok ? 0 : 1);
}

if (cmd === 'offset') {
  // Чек ЗАЧЁТА предоплаты с кодами маркировки по оплаченному prepay-платежу.
  const id = process.argv[3];
  if (!id) { console.error('нужен payment_id (оплаченный prepay)'); process.exit(2); }
  const post = buildPostPaymentReceipt({
    lines: [
      {
        description: 'Бальзам маркированный (зачёт предоплаты)',
        priceKopecks: 20000,
        quantity: 2,
        isMarked: true,
        markCodes: [fakeCode(11), fakeCode(12)],
      },
    ],
    discountKopecks: 0,
    deliveryKopecks: 0,
    totalKopecks: 40000,
    customer: { email: 'sandbox-smoke@example.com' },
    config, // full_payment: полный расчёт при передаче товара
    paymentId: id,
    timezone: 6,
  });
  // Зачёт ранее внесённой предоплаты: расчёт типом prepayment, не cashless.
  post.settlements = [
    { type: 'prepayment', amount: { value: formatAmount(40000), currency: 'RUB' } },
  ] as unknown as typeof post.settlements;
  const r = await api('POST', '/receipts', post);
  const ok = show('чек ЗАЧЁТА предоплаты с mark_code_info принят', r.status, r.json);
  if (ok) console.log(`  receipt id: ${r.json.id}, status: ${r.json.status}`);
  process.exit(ok ? 0 : 1);
}

console.error(`неизвестная команда: ${cmd}`);
process.exit(2);
