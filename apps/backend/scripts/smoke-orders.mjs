/**
 * Смоук заказов (этап 1, шаг 5).
 * Запуск: bun scripts/smoke-orders.mjs [baseUrl]
 * Требует DATABASE_URL (уборка тестовых заказов в конце).
 */
import pg from 'pg';

const BASE = process.argv[2] ?? 'http://localhost:3000/api/v1';
const TEST_PHONE = '+79990000001'; // маркер тестовых заказов для уборки
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✖ ${name}: ${err.message}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const api = async (method, path, body, headers = {}, expectStatus) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (expectStatus !== undefined && res.status !== expectStatus) {
    const t = await res.text();
    throw new Error(`${path} -> HTTP ${res.status} (ждали ${expectStatus}): ${t.slice(0, 160)}`);
  }
  return { status: res.status, body: await res.json().catch(() => null) };
};

const baseOrder = {
  name: 'Тест Смоук',
  phone: TEST_PHONE,
  deliveryMethod: 'pickup_titova',
  paymentMethod: 'cash_on_pickup',
  items: [{ id: 'syr-graf-monte-kristo', quantity: 2 }],
};

/** Уборка тестовых данных + сброс кеша каталога (повторяемость прогонов). */
async function cleanup(label) {
  if (!process.env.DATABASE_URL) {
    console.warn(`  ⚠ DATABASE_URL не задан — уборка (${label}) пропущена`);
    return;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rowCount } = await client.query(
    'DELETE FROM orders WHERE customer_phone = $1',
    [TEST_PHONE],
  );
  await client.query("DELETE FROM idempotency_keys WHERE key LIKE 'smoke-%'");
  await client.end();
  if (process.env.REDIS_URL) {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    const keys = await redis.keys('catalog:*').catch(() => []);
    if (keys.length) await redis.del(...keys);
    redis.disconnect();
  }
  console.log(`  🧹 уборка (${label}): заказов удалено ${rowCount}`);
}

console.log(`Смоук заказов: ${BASE}`);
await cleanup('перед прогоном');

const availableBefore = async () => {
  const d = (await api('GET', '/catalog?q=Монте')).body;
  return d.items[0].availableQty;
};

let created; // первый заказ — используется в нескольких проверках
let qtyBefore;

await check('POST /orders — самовывоз, оплата на месте (201, status=new)', async () => {
  qtyBefore = await availableBefore();
  const r = await api('POST', '/orders', baseOrder, {}, 201);
  created = r.body;
  assert(created.orderNumber?.startsWith('ALT-'), 'номер заказа');
  assert(created.status === 'new', `status=${created.status}`);
  assert(created.totals.deliveryRub === 0, 'самовывоз должен быть бесплатным');
  assert(created.totals.subtotalRub === 238, `subtotal=${created.totals.subtotalRub}`);
  assert(created.accessToken, 'нет accessToken');
});

await check('резерв сразу уменьшает доступный остаток в каталоге', async () => {
  const after = await availableBefore();
  assert(after === qtyBefore - 2, `было ${qtyBefore}, стало ${after} (ждали -2)`);
});

await check('GET /orders/{id} — по токену ок, без токена/с чужим — 404', async () => {
  const d = (await api('GET', `/orders/${created.id}?token=${created.accessToken}`, undefined, {}, 200)).body;
  assert(d.orderNumber === created.orderNumber, 'номер');
  assert(d.items.length === 1 && d.items[0].quantity === 2, 'состав');
  assert(d.instruction.includes('Титова'), 'инструкция самовывоза');
  await api('GET', `/orders/${created.id}`, undefined, {}, 404);
  await api('GET', `/orders/${created.id}?token=00000000-0000-0000-0000-000000000000`, undefined, {}, 404);
});

await check('идемпотентность: повтор ключа -> тот же заказ; другой запрос -> 409', async () => {
  const key = `smoke-${created.orderNumber}`;
  const first = await api('POST', '/orders', baseOrder, { 'Idempotency-Key': key }, 201);
  const second = await api('POST', '/orders', baseOrder, { 'Idempotency-Key': key }, 201);
  assert(first.body.orderNumber === second.body.orderNumber, 'повтор дал другой заказ');
  await api('POST', '/orders', { ...baseOrder, name: 'Другое Тело' }, { 'Idempotency-Key': key }, 409);
});

await check('онлайн-оплата -> awaiting_payment; промокод фиксируется в сумме', async () => {
  const r = await api('POST', '/orders', {
    ...baseOrder,
    deliveryMethod: 'courier_nsk',
    deliveryAddress: 'Новосибирск, ул. Тестовая 1',
    paymentMethod: 'online',
    items: [{ id: 'pantogematogen-250-ml', quantity: 2 }],
    promoCode: 'ALTAI10',
  }, {}, 201);
  const t = r.body.totals;
  assert(r.body.status === 'awaiting_payment', r.body.status);
  assert(t.subtotalRub === 2520 && t.discountRub === 252, `суммы: ${JSON.stringify(t)}`);
  assert(t.deliveryRub === 300, `доставка ${t.deliveryRub} (2268 < порога 3000)`);
  assert(t.totalRub === 2568, `итого ${t.totalRub}`);
});

await check('порог бесплатной доставки курьером', async () => {
  const r = await api('POST', '/orders', {
    ...baseOrder,
    deliveryMethod: 'courier_nsk',
    deliveryAddress: 'Новосибирск, ул. Тестовая 1',
    paymentMethod: 'online',
    items: [{ id: 'pantogematogen-250-ml', quantity: 3 }], // 3780 > 3000
  }, {}, 201);
  assert(r.body.totals.deliveryRub === 0, `доставка ${r.body.totals.deliveryRub}`);
});

await check('скоропорт по России — блокируется (400)', async () => {
  const r = await api('POST', '/orders', {
    ...baseOrder,
    deliveryMethod: 'russia',
    deliveryAddress: 'Москва, ул. Тестовая 2',
    paymentMethod: 'online',
  }, {}, 400);
  assert(r.body.message?.code === 'PERISHABLE_RUSSIA_BLOCKED' || JSON.stringify(r.body).includes('PERISHABLE'), JSON.stringify(r.body).slice(0, 120));
});

await check('оплата на месте при доставке — запрещена (400)', async () => {
  await api('POST', '/orders', {
    ...baseOrder,
    deliveryMethod: 'courier_nsk',
    deliveryAddress: 'Новосибирск, ул. Тестовая 1',
    paymentMethod: 'cash_on_pickup',
  }, {}, 400);
});

await check('нет остатка — 400 с указанием позиции и доступного количества', async () => {
  const r = await api('POST', '/orders', {
    ...baseOrder,
    items: [{ id: 'syr-graf-monte-kristo', quantity: 999 }],
  }, {}, 400);
  const s = JSON.stringify(r.body);
  assert(s.includes('out_of_stock') && s.includes('availableQty'), s.slice(0, 160));
});

await check('изменилась цена — 400 с актуальной ценой', async () => {
  const r = await api('POST', '/orders', {
    ...baseOrder,
    items: [{ id: 'syr-graf-monte-kristo', quantity: 1, priceRub: 99 }],
  }, {}, 400);
  const s = JSON.stringify(r.body);
  assert(s.includes('price_changed') && s.includes('119'), s.slice(0, 160));
});

await check('неизвестный товар — 400 unknown_item', async () => {
  const r = await api('POST', '/orders', {
    ...baseOrder,
    items: [{ id: 'net-takogo', quantity: 1 }],
  }, {}, 400);
  assert(JSON.stringify(r.body).includes('unknown_item'), 'unknown_item');
});

await cleanup('после прогона');

if (failed) {
  console.error(`\nПРОВАЛЕНО ПРОВЕРОК: ${failed}`);
  process.exit(1);
}
console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
