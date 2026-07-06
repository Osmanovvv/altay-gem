/**
 * Смоук публичного API каталога (этап 1, шаг 3) — «коллекция запросов».
 * Запуск: bun scripts/smoke-catalog.mjs [baseUrl]
 * Все проверки обязаны пройти; любой фейл — exit 1.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000/api/v1';
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
const get = async (path, expectStatus = 200) => {
  const res = await fetch(BASE + path);
  if (res.status !== expectStatus) {
    throw new Error(`${path} -> HTTP ${res.status} (ждали ${expectStatus})`);
  }
  return expectStatus === 200 ? res.json() : null;
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

console.log(`Смоук каталога: ${BASE}`);

await check('GET /catalog — карточки и пагинация', async () => {
  const d = await get('/catalog');
  assert(d.items.length > 0, 'пустой каталог');
  assert(d.pagination.total >= 8, `total=${d.pagination.total} < 8`);
  const c = d.items[0];
  for (const f of ['slug', 'name', 'priceRub', 'badges', 'unit', 'inStock'])
    assert(f in c, `нет поля ${f}`);
  assert(Object.keys(d.categoryCounts).length >= 3, 'нет categoryCounts');
});

await check('GET /catalog — сортировка price_desc', async () => {
  const d = await get('/catalog?sort=price_desc');
  const prices = d.items.map((i) => i.priceRub);
  for (let i = 1; i < prices.length; i++)
    assert(prices[i - 1] >= prices[i], 'не отсортировано по убыванию');
});

await check('GET /catalog — фильтр категории', async () => {
  const d = await get('/catalog?category=syry-i-maslo');
  assert(d.items.length === 3, `в категории ${d.items.length}, ждали 3`);
  assert(
    d.items.every((i) => i.categorySlug === 'syry-i-maslo'),
    'чужая категория в выдаче',
  );
});

await check('GET /catalog — фильтр цены', async () => {
  const d = await get('/catalog?priceMin=500&priceMax=1300');
  assert(d.items.length > 0, 'пусто');
  assert(
    d.items.every((i) => i.priceRub >= 500 && i.priceRub <= 1300),
    'цена вне диапазона',
  );
});

await check('GET /catalog — поиск q по названию/описанию', async () => {
  const d = await get('/catalog?q=жир');
  assert(d.items.length >= 1, 'поиск «жир» ничего не нашёл');
  const d2 = await get('/catalog?q=пантовых');
  assert(d2.items.length >= 1, 'поиск по описанию не работает');
});

await check('GET /catalog — весовой товар порциями', async () => {
  const d = await get('/catalog?q=Монте');
  const cheese = d.items[0];
  assert(cheese.unit === 'порция 100 г', `unit=${cheese.unit}`);
  assert(cheese.priceRub === 119, `цена порции ${cheese.priceRub}, ждали 119`);
  assert(cheese.availableQty === 26, `порций ${cheese.availableQty}, ждали 26`);
});

await check('GET /catalog — пагинация perPage=3', async () => {
  const d = await get('/catalog?perPage=3&page=2');
  assert(d.items.length === 3, 'размер страницы');
  assert(d.pagination.pageCount === Math.ceil(d.pagination.total / 3), 'pageCount');
});

await check('GET /catalog — валидация мусорного запроса (400)', async () => {
  await get('/catalog?page=abc', 400);
});

await check('GET /categories — дерево с количеством', async () => {
  const d = await get('/categories');
  assert(d.length >= 3, 'меньше 3 категорий');
  const c = d.find((x) => x.slug === 'syry-i-maslo');
  assert(c.productCount === 3, `count=${c.productCount}`);
  assert(c.subcategories.length === 3, 'нет подкатегорий');
});

await check('GET /products/{slug} — полная карточка', async () => {
  const d = await get('/products/syr-graf-monte-kristo');
  assert(d.characteristics.manufacturer === 'Брюкке', 'характеристики');
  assert(d.deliveryZone === 'nsk_only', 'скоропорт должен быть nsk_only');
  assert(Array.isArray(d.related) && d.related.length > 0, 'нет «с этим покупают»');
  assert(d.photos.length > 0, 'нет фото');
});

await check('GET /products/{slug} — 404 на несуществующем', async () => {
  await get('/products/net-takogo-tovara', 404);
});

await check('GET /home — hero, хиты, баннеры, тексты, доверие', async () => {
  const d = await get('/home');
  assert(d.hero && d.hero.slug, 'нет hero-товара');
  assert(d.hits.length >= 2, 'хитов меньше 2');
  assert(d.banners.length >= 1 && d.banners[0].image, 'нет баннера с картинкой');
  assert(d.banners[0].link?.type === 'category', 'ссылка баннера');
  assert(d.sections.apiary && d.sections.advantages.length === 4, 'секции');
  assert(d.trust && Number(d.trust.yandexRating) === 4.9, 'строка доверия');
});

await check('GET /promos и /promos/{slug}', async () => {
  const list = await get('/promos');
  assert(list.length >= 1, 'нет акций');
  const d = await get(`/promos/${list[0].slug}`);
  assert(d.promocode === 'ALTAI10', 'промокод акции');
  assert(d.conditions.length === 2, 'условия');
  assert(d.products.length === 2, 'товары-участники');
  await get('/promos/net-takoy-akcii', 404);
});

await check('GET /reviews — средний рейтинг и список', async () => {
  const d = await get('/reviews');
  assert(d.count === 3, `отзывов ${d.count}`);
  assert(d.average === 4.7, `средний ${d.average}, ждали 4.7`);
  assert(d.reviews[0].author, 'пустой отзыв');
});

await check('GET /settings — контакты, точки, тарифы', async () => {
  const d = await get('/settings');
  assert(d.contacts?.phone, 'нет контактов');
  assert(d.storePoints.length === 2, 'точки');
  assert(d.delivery.courierNskPriceRub === 300, 'тариф курьера');
  assert(d.delivery.russiaWeightTiers.length === 4, 'сетка веса');
});

const post = async (path, body, expectStatus = 200) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== expectStatus) {
    throw new Error(`${path} -> HTTP ${res.status} (ждали ${expectStatus})`);
  }
  return res.json().catch(() => null);
};

const CART_HEALTH = [
  { id: 'pantogematogen-250-ml', quantity: 2 }, // Здоровье Алтая, 1260р
  { id: 'syr-graf-monte-kristo', quantity: 3 }, // Сыры, 119р/порция
];

await check('POST /promo/validate — скидка только с категории акции', async () => {
  const d = await post('/promo/validate', { code: 'ALTAI10', items: CART_HEALTH });
  assert(d.valid === true, `valid=${d.valid} ${d.message ?? ''}`);
  assert(d.discountRub === 252, `скидка ${d.discountRub}, ждали 252 (10% с 2520)`);
  assert(d.appliesTo === 'category', 'appliesTo');
});

await check('POST /promo/validate — регистр кода не важен', async () => {
  const d = await post('/promo/validate', { code: 'altai10', items: CART_HEALTH });
  assert(d.valid === true, 'нижний регистр не принят');
});

await check('POST /promo/validate — не применим к чужой корзине', async () => {
  const d = await post('/promo/validate', {
    code: 'ALTAI10',
    items: [{ id: 'syr-graf-monte-kristo', quantity: 1 }],
  });
  assert(d.valid === false && d.reason === 'not_applicable', `reason=${d.reason}`);
});

await check('POST /promo/validate — не найден / истёк / выключен', async () => {
  const nf = await post('/promo/validate', { code: 'NOSUCH', items: CART_HEALTH });
  assert(nf.reason === 'not_found' && nf.message.includes('не найден'), 'not_found');
  const old = await post('/promo/validate', { code: 'OLD10', items: CART_HEALTH });
  assert(old.reason === 'expired', `OLD10 reason=${old.reason}`);
  const stop = await post('/promo/validate', { code: 'STOP10', items: CART_HEALTH });
  assert(stop.reason === 'inactive', `STOP10 reason=${stop.reason}`);
});

await check('POST /promo/validate — валидация тела (400)', async () => {
  await post('/promo/validate', { code: 'X'.repeat(100), items: [] }, 400);
  await post('/promo/validate', { items: CART_HEALTH }, 400);
});

if (failed) {
  console.error(`\nПРОВАЛЕНО ПРОВЕРОК: ${failed}`);
  process.exit(1);
}
console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
