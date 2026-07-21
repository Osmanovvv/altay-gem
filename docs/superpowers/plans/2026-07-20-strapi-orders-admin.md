# Раздел «Заказы» в Strapi — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Живой раздел «Заказы» в админке Strapi: список, карточка, скан кодов маркировки, «Фискализировать», смена статусов — поверх готового админ-API бэкенда.

**Architecture:** Локальный плагин Strapi `orders` (apps/strapi/src/plugins/orders). Admin-часть — React-страницы в дизайн-системе Strapi; server-часть — тонкий прокси к бэкенду `/api/v1/admin/*` с сервисным логином (токен-кэш) и словарём ошибок. Никакой бизнес-логики в плагине; заказы в Strapi не хранятся.

**Tech Stack:** Strapi 5.50 (TS), @strapi/design-system, bun test (юниты чистой логики), playwright-core (приёмка на проде).

**Спека:** `docs/superpowers/specs/2026-07-20-strapi-orders-admin-design.md`

## Контракты бэкенда (зафиксировано по коду, не менять)

- `POST {API}/admin/login` body `{"password": "..."}` → 200 `{token, expiresAt}`; далее `Authorization: Bearer <token>` (TTL 12 ч).
- `GET {API}/admin/orders?status=&deliveryMethod=&limit=&offset=` → `{items:[{id,orderNumber,status,customerName,customerPhone,deliveryMethod,totalRub,itemsCount,source,createdAt}], total, limit, offset}`.
- `GET {API}/admin/orders/:id` → `{id, orderNumber, status, createdAt, updatedAt, paidAt, customer:{name,phone,email}, deliveryMethod, deliveryAddress, paymentMethod, source, comment, cancelReason, promoCode, totals:{subtotalRub,discountRub,deliveryRub,totalRub}, items:[{id,name,quantity,unit,isMarked,markCodes,priceRub,sumRub}], fiscalReceiptId, fiscalizationInProgress, fiscalizationRequired}`.
- `PATCH {API}/admin/orders/:id/status` body `{status, reason?}` → `{id,status}`.
- `PATCH {API}/admin/orders/:id/items/:itemId/mark-codes` body `{codes:[...]}` → `{itemId,saved,required}`.
- `POST {API}/admin/orders/:id/fiscalize` → `{receiptId,status,already?}`.
- Ошибки Nest: `{statusCode, message, ...}` либо `{code, message}` (Conflict/BadRequest c кодами `ORDER_NOT_FISCALIZED`, `ORDER_FISCALIZED`, `ORDER_TRANSITION_FORBIDDEN` и человекочитаемые тексты маркировки).

Статусы: `new, awaiting_payment, paid, assembling, ready_for_pickup, shipped, completed, cancelled`.
Разрешённые переходы (зеркало графа бэкенда, только для видимости кнопок):
`new→assembling|cancelled; awaiting_payment→paid|cancelled; paid→assembling|cancelled; assembling→ready_for_pickup|shipped; ready_for_pickup→completed; shipped→completed`.

---

### Task 1: Каркас плагина + пункт меню (смоук-гейт)

Цель: «Заказы» появляется в меню админки, заглушка-страница рендерится, серверная ping-рута отвечает. Это гейт на верность структуры local-plugin в Strapi 5 — до любого функционала.

**Files:**
- Create: `apps/strapi/src/plugins/orders/package.json`
- Create: `apps/strapi/src/plugins/orders/strapi-server.js`
- Create: `apps/strapi/src/plugins/orders/strapi-admin.js`
- Create: `apps/strapi/src/plugins/orders/server/index.js`
- Create: `apps/strapi/src/plugins/orders/admin/src/index.js`
- Create: `apps/strapi/src/plugins/orders/admin/src/pages/App.jsx`
- Modify: `apps/strapi/config/plugins.ts` (регистрация)

- [ ] **Step 1: package.json плагина**

```json
{
  "name": "orders",
  "version": "0.1.0",
  "description": "Раздел «Заказы»: сборка и фискализация (прокси к бэкенду)",
  "strapi": { "kind": "plugin", "name": "orders", "displayName": "Заказы" }
}
```

- [ ] **Step 2: точки входа**

`strapi-server.js`:
```js
'use strict';
module.exports = require('./server');
```

`strapi-admin.js`:
```js
'use strict';
module.exports = require('./admin/src').default;
```

- [ ] **Step 3: server/index.js — ping-рута (тип admin: защищена админ-сессией Strapi)**

```js
'use strict';

module.exports = {
  routes: {
    admin: {
      type: 'admin',
      routes: [
        {
          method: 'GET',
          path: '/ping',
          handler: 'bridge.ping',
          config: { policies: [] },
        },
      ],
    },
  },
  controllers: {
    bridge: {
      async ping(ctx) {
        ctx.body = { ok: true };
      },
    },
  },
};
```

- [ ] **Step 4: admin/src/index.js — регистрация меню и страницы**

```jsx
import App from './pages/App';

export default {
  register(app) {
    app.addMenuLink({
      to: 'plugins/orders',
      icon: () => '🛒',
      intlLabel: { id: 'orders.menu', defaultMessage: 'Заказы' },
      Component: async () => App,
      permissions: [],
    });
    app.registerPlugin({ id: 'orders', name: 'orders' });
  },
  bootstrap() {},
};
```

`admin/src/pages/App.jsx`:
```jsx
const App = () => <div style={{ padding: 32 }}>Заказы: каркас работает</div>;
export default App;
```

- [ ] **Step 5: регистрация в config/plugins.ts** — добавить в возвращаемый объект:

```ts
  orders: {
    enabled: true,
    resolve: './src/plugins/orders',
  },
```

- [ ] **Step 6: смоук локально**

Run (нужна локальная БД из дев-этапов, postgres на 5432; env как в предыдущих локальных запусках Strapi):
`cd apps/strapi && bun run develop`
Ожидание: админка поднимается; в меню слева есть «Заказы» (🛒); клик открывает «каркас работает»; в DevTools `fetch('/orders/ping')` из админки (авторизованной) → `{ok:true}`.
Если меню/рута не появились — свериться с установленной документацией `node_modules/@strapi/strapi` (структура local plugin v5: возможно потребуется `admin/src/index.js` в формате default-export с `register(app)`, как выше, или путь рут `/orders/ping` окажется с префиксом — зафиксировать фактический URL в комментарии server/index.js и использовать его в Task 5).

- [ ] **Step 7: Commit**

```bash
git add apps/strapi/src/plugins/orders apps/strapi/config/plugins.ts
git commit -m "feat(strapi): каркас плагина «Заказы» — меню, заглушка, ping"
```

---

### Task 2: Чистый модуль моста — токен-кэш и запросы (TDD)

**Files:**
- Create: `apps/strapi/src/plugins/orders/server/lib/backend-client.js`
- Test: `apps/strapi/src/plugins/orders/server/lib/backend-client.spec.ts`

- [ ] **Step 1: падающий тест**

```ts
import { describe, expect, it } from 'bun:test';
import { createBackendClient } from './backend-client';

function fakeFetch(script: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const step = script.shift() ?? { status: 500, body: { message: 'нет шага' } };
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () => step.body,
    } as Response;
  };
  return { fn, calls };
}

const base = { apiUrl: 'http://b/api/v1', password: 'pw', timeoutMs: 1000 };

describe('backend-client', () => {
  it('логинится один раз и кэширует токен', async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { token: 't1', expiresAt: Date.now() + 9e6 } },
      { status: 200, body: { items: [] } },
      { status: 200, body: { items: [] } },
    ]);
    const c = createBackendClient({ ...base, fetchFn: fn });
    await c.request('GET', '/admin/orders');
    await c.request('GET', '/admin/orders');
    const logins = calls.filter((x) => x.url.endsWith('/admin/login'));
    expect(logins.length).toBe(1);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer t1');
  });

  it('на 401 перелогинивается ОДИН раз и повторяет запрос', async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { token: 'old', expiresAt: Date.now() + 9e6 } },
      { status: 401, body: { message: 'Требуется вход' } },
      { status: 200, body: { token: 'new', expiresAt: Date.now() + 9e6 } },
      { status: 200, body: { id: 1 } },
    ]);
    const c = createBackendClient({ ...base, fetchFn: fn });
    const r = await c.request('GET', '/admin/orders/1');
    expect(r).toEqual({ id: 1 });
    expect(calls.filter((x) => x.url.endsWith('/admin/login')).length).toBe(2);
  });

  it('без пароля бросает ORDERS_NOT_CONFIGURED', async () => {
    const c = createBackendClient({ ...base, password: '', fetchFn: fakeFetch([]).fn });
    await expect(c.request('GET', '/admin/orders')).rejects.toMatchObject({
      code: 'ORDERS_NOT_CONFIGURED',
    });
  });

  it('ошибка бэкенда пробрасывается с кодом и текстом', async () => {
    const { fn } = fakeFetch([
      { status: 200, body: { token: 't', expiresAt: Date.now() + 9e6 } },
      { status: 409, body: { code: 'ORDER_NOT_FISCALIZED', message: 'Сначала чек' } },
    ]);
    const c = createBackendClient({ ...base, fetchFn: fn });
    await expect(c.request('PATCH', '/admin/orders/1/status', { status: 'shipped' }))
      .rejects.toMatchObject({ status: 409, code: 'ORDER_NOT_FISCALIZED' });
  });
});
```

- [ ] **Step 2: RED** — `cd apps/strapi && bun test src/plugins/orders` → FAIL (модуля нет).

- [ ] **Step 3: реализация `backend-client.js`**

```js
'use strict';

/**
 * Мост к админ-API бэкенда: сервисный логин паролем, кэш токена в памяти,
 * один повтор на 401, таймаут. Никакой бизнес-логики — только транспорт.
 */
function createBackendClient({ apiUrl, password, timeoutMs = 10000, fetchFn = fetch }) {
  let token = null;
  let expiresAt = 0;

  const err = (status, code, message) =>
    Object.assign(new Error(message), { status, code });

  async function call(method, path, body, auth) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(`${apiUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw err(res.status, json.code, json.message || `HTTP ${res.status}`);
      }
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw err(504, 'ORDERS_TIMEOUT', 'Сервер заказов не ответил');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  async function login() {
    if (!password) throw err(503, 'ORDERS_NOT_CONFIGURED', 'ORDERS_ADMIN_PASSWORD не задан');
    const r = await call('POST', '/admin/login', { password });
    token = r.token;
    expiresAt = r.expiresAt;
  }

  async function request(method, path, body) {
    if (!token || Date.now() > expiresAt - 60000) await login();
    try {
      return await call(method, path, body, token);
    } catch (e) {
      if (e.status !== 401) throw e;
      await login(); // токен мог протухнуть/бэкенд перезапущен — один повтор
      return call(method, path, body, token);
    }
  }

  return { request };
}

module.exports = { createBackendClient };
```

- [ ] **Step 4: GREEN** — `bun test src/plugins/orders` → 4 pass.
- [ ] **Step 5: Commit** — `git add ... && git commit -m "feat(strapi/orders): мост к бэкенду — токен-кэш, повтор на 401 (TDD)"`

---

### Task 3: Словарь ошибок (TDD)

**Files:**
- Create: `apps/strapi/src/plugins/orders/server/lib/error-map.js`
- Test: `apps/strapi/src/plugins/orders/server/lib/error-map.spec.ts`

- [ ] **Step 1: падающий тест**

```ts
import { describe, expect, it } from 'bun:test';
import { humanError } from './error-map';

describe('humanError', () => {
  it('коды бэкенда → фиксированные тексты', () => {
    expect(humanError({ code: 'ORDER_NOT_FISCALIZED', message: 'x' }))
      .toBe('Сначала отсканируйте коды и выбейте чек — потом выдача');
    expect(humanError({ code: 'ORDER_FISCALIZED', message: 'x' }))
      .toBe('Чек уже выбит — отмена только после чека возврата в ЮKassa');
    expect(humanError({ code: 'ORDER_TRANSITION_FORBIDDEN', message: 'x' }))
      .toBe('Действие недоступно для текущего статуса — обновите страницу');
    expect(humanError({ code: 'ORDERS_NOT_CONFIGURED', message: 'x' }))
      .toBe('Раздел не настроен: нет доступа к серверу заказов');
  });
  it('без кода — текст бэкенда как есть (он человекочитаемый)', () => {
    expect(humanError({ message: 'кодов маркировки 1, а единиц 2 — чек не собрать' }))
      .toBe('кодов маркировки 1, а единиц 2 — чек не собрать');
  });
  it('совсем без текста — общий текст', () => {
    expect(humanError({})).toBe('Не удалось связаться с сервером заказов. Повторите');
  });
});
```

- [ ] **Step 2: RED.** Step 3: реализация:

```js
'use strict';

const BY_CODE = {
  ORDER_NOT_FISCALIZED: 'Сначала отсканируйте коды и выбейте чек — потом выдача',
  ORDER_FISCALIZED: 'Чек уже выбит — отмена только после чека возврата в ЮKassa',
  ORDER_TRANSITION_FORBIDDEN: 'Действие недоступно для текущего статуса — обновите страницу',
  ORDERS_NOT_CONFIGURED: 'Раздел не настроен: нет доступа к серверу заказов',
  ORDERS_TIMEOUT: 'Сервер заказов не ответил. Повторите',
};

function humanError(e) {
  if (e && e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  if (e && typeof e.message === 'string' && e.message.trim()) return e.message;
  return 'Не удалось связаться с сервером заказов. Повторите';
}

module.exports = { humanError };
```

- [ ] **Step 4: GREEN.** Step 5: Commit `feat(strapi/orders): словарь ошибок (TDD)`.

---

### Task 4: Серверные руты-прокси

**Files:**
- Modify: `apps/strapi/src/plugins/orders/server/index.js` (заменить ping-каркас на полный)

- [ ] **Step 1: полный server/index.js**

```js
'use strict';

const { createBackendClient } = require('./lib/backend-client');
const { humanError } = require('./lib/error-map');

let client = null;
function getClient() {
  if (!client) {
    client = createBackendClient({
      apiUrl: process.env.ORDERS_API_URL || 'http://127.0.0.1:3002/api/v1',
      password: process.env.ORDERS_ADMIN_PASSWORD || '',
    });
  }
  return client;
}

/** Обёртка контроллера: прокси + перевод ошибок в понятный текст. */
const proxy = (fn) => async (ctx) => {
  try {
    ctx.body = await fn(ctx, getClient());
  } catch (e) {
    ctx.status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
    ctx.body = { error: humanError(e), code: e.code };
  }
};

module.exports = {
  routes: {
    admin: {
      type: 'admin',
      routes: [
        { method: 'GET', path: '/orders', handler: 'bridge.list', config: { policies: [] } },
        { method: 'GET', path: '/orders/:id', handler: 'bridge.one', config: { policies: [] } },
        { method: 'PATCH', path: '/orders/:id/status', handler: 'bridge.status', config: { policies: [] } },
        { method: 'PATCH', path: '/orders/:id/items/:itemId/mark-codes', handler: 'bridge.markCodes', config: { policies: [] } },
        { method: 'POST', path: '/orders/:id/fiscalize', handler: 'bridge.fiscalize', config: { policies: [] } },
      ],
    },
  },
  controllers: {
    bridge: {
      list: proxy((ctx, c) => {
        const q = new URLSearchParams();
        for (const k of ['status', 'deliveryMethod', 'limit', 'offset']) {
          if (ctx.query[k]) q.set(k, String(ctx.query[k]));
        }
        const qs = q.toString();
        return c.request('GET', `/admin/orders${qs ? `?${qs}` : ''}`);
      }),
      one: proxy((ctx, c) => c.request('GET', `/admin/orders/${Number(ctx.params.id)}`)),
      status: proxy((ctx, c) =>
        c.request('PATCH', `/admin/orders/${Number(ctx.params.id)}/status`, ctx.request.body),
      ),
      markCodes: proxy((ctx, c) =>
        c.request(
          'PATCH',
          `/admin/orders/${Number(ctx.params.id)}/items/${Number(ctx.params.itemId)}/mark-codes`,
          ctx.request.body,
        ),
      ),
      fiscalize: proxy((ctx, c) => c.request('POST', `/admin/orders/${Number(ctx.params.id)}/fiscalize`)),
    },
  },
};
```

- [ ] **Step 2: смоук в develop** — с `ORDERS_API_URL=https://ecomarket-altai.ru/api/v1` и `ORDERS_ADMIN_PASSWORD=<из прод-.env бэкенда>` в `apps/strapi/.env`: из залогиненной админки `fetch('/orders/orders').then(r=>r.json())` → реальный список заказов прода (только чтение). Ожидание: `{items:[...], total: …}`.
- [ ] **Step 3: юниты не сломаны** — `bun test src/plugins/orders` → 7 pass.
- [ ] **Step 4: Commit** `feat(strapi/orders): серверные руты-прокси к админ-API бэкенда`.

---

### Task 5: UI — список заказов

**Files:**
- Create: `apps/strapi/src/plugins/orders/admin/src/api.js`
- Create: `apps/strapi/src/plugins/orders/admin/src/labels.js`
- Create: `apps/strapi/src/plugins/orders/admin/src/pages/OrdersList.jsx`
- Modify: `apps/strapi/src/plugins/orders/admin/src/pages/App.jsx` (роутинг список/карточка)

- [ ] **Step 1: api.js — клиент админки (fetch Strapi с админ-JWT)**

```js
import { getFetchClient } from '@strapi/strapi/admin';

const base = '/orders';

export async function fetchOrders(params) {
  const { get } = getFetchClient();
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
  ).toString();
  const { data } = await get(`${base}/orders${q ? `?${q}` : ''}`);
  return data;
}
export async function fetchOrder(id) {
  const { get } = getFetchClient();
  const { data } = await get(`${base}/orders/${id}`);
  return data;
}
export async function saveMarkCodes(id, itemId, codes) {
  const { put, post, ...rest } = getFetchClient();
  const patch = rest.patch ?? put; // фактический метод сверить в Task 1-смоуке
  const { data } = await patch(`${base}/orders/${id}/items/${itemId}/mark-codes`, { codes });
  return data;
}
export async function fiscalize(id) {
  const { post } = getFetchClient();
  const { data } = await post(`${base}/orders/${id}/fiscalize`);
  return data;
}
export async function setStatus(id, status, reason) {
  const { put, ...rest } = getFetchClient();
  const patch = rest.patch ?? put;
  const { data } = await patch(`${base}/orders/${id}/status`, { status, reason });
  return data;
}
```

- [ ] **Step 2: labels.js — русские подписи и граф переходов**

```js
export const STATUS_LABEL = {
  new: 'Новый', awaiting_payment: 'Ожидает оплаты', paid: 'Оплачен',
  assembling: 'Собирается', ready_for_pickup: 'Готов к выдаче',
  shipped: 'Передан в доставку', completed: 'Выполнен', cancelled: 'Отменён',
};
export const STATUS_COLOR = {
  new: 'neutral', awaiting_payment: 'warning', paid: 'success',
  assembling: 'secondary', ready_for_pickup: 'success',
  shipped: 'secondary', completed: 'neutral', cancelled: 'danger',
};
export const DELIVERY_LABEL = {
  pickup_leningradskaya: 'Самовывоз: Ленинградская',
  pickup_titova: 'Самовывоз: Титова',
  courier_nsk: 'Курьер по Новосибирску',
  russia: 'Доставка по России',
};
export const PAYMENT_LABEL = {
  online: 'Онлайн', cash_on_pickup: 'Наличными при получении', card_on_pickup: 'Картой при получении',
};
/** Зеркало графа бэкенда — только для видимости кнопок; истина на бэкенде. */
export const NEXT_STATUSES = {
  new: ['assembling', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['assembling', 'cancelled'],
  assembling: ['ready_for_pickup', 'shipped'],
  ready_for_pickup: ['completed'],
  shipped: ['completed'],
  completed: [], cancelled: [],
};
```

- [ ] **Step 3: OrdersList.jsx**

```jsx
import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Table, Thead, Tbody, Tr, Th, Td,
  Badge, SingleSelect, SingleSelectOption, Button, Flex, Loader,
} from '@strapi/design-system';
import { fetchOrders } from '../api';
import { STATUS_LABEL, STATUS_COLOR, DELIVERY_LABEL } from '../labels';

const PAGE = 50;

export default function OrdersList({ onOpen }) {
  const [state, setState] = useState({ items: [], total: 0, loading: true, error: null });
  const [filters, setFilters] = useState({ status: '', deliveryMethod: '', offset: 0 });

  const load = useCallback(async (silent = false) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchOrders({ ...filters, limit: PAGE });
      setState({ items: data.items, total: data.total, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.response?.data?.error || 'Не удалось загрузить заказы' }));
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => load(true), 30000); return () => clearInterval(t); }, [load]);

  return (
    <Box padding={8}>
      <Typography variant="alpha" tag="h1">Заказы</Typography>
      <Flex gap={4} paddingTop={4} paddingBottom={4}>
        <SingleSelect placeholder="Все статусы" value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v, offset: 0 }))} onClear={() => setFilters((f) => ({ ...f, status: '', offset: 0 }))}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <SingleSelectOption key={k} value={k}>{v}</SingleSelectOption>
          ))}
        </SingleSelect>
        <SingleSelect placeholder="Все способы получения" value={filters.deliveryMethod}
          onChange={(v) => setFilters((f) => ({ ...f, deliveryMethod: v, offset: 0 }))} onClear={() => setFilters((f) => ({ ...f, deliveryMethod: '', offset: 0 }))}>
          {Object.entries(DELIVERY_LABEL).map(([k, v]) => (
            <SingleSelectOption key={k} value={k}>{v}</SingleSelectOption>
          ))}
        </SingleSelect>
        <Button variant="tertiary" onClick={() => load()}>Обновить</Button>
      </Flex>
      {state.error && <Typography textColor="danger600">{state.error}</Typography>}
      {state.loading ? <Loader>Загрузка…</Loader> : (
        <Table colCount={7} rowCount={state.items.length}>
          <Thead><Tr>
            <Th><Typography variant="sigma">№</Typography></Th>
            <Th><Typography variant="sigma">Дата</Typography></Th>
            <Th><Typography variant="sigma">Клиент</Typography></Th>
            <Th><Typography variant="sigma">Получение</Typography></Th>
            <Th><Typography variant="sigma">Сумма</Typography></Th>
            <Th><Typography variant="sigma">Позиции</Typography></Th>
            <Th><Typography variant="sigma">Статус</Typography></Th>
          </Tr></Thead>
          <Tbody>
            {state.items.map((o) => (
              <Tr key={o.id} onClick={() => onOpen(o.id)} style={{ cursor: 'pointer' }}>
                <Td><Typography fontWeight="bold">{o.orderNumber}</Typography></Td>
                <Td><Typography>{new Date(o.createdAt).toLocaleString('ru-RU')}</Typography></Td>
                <Td><Typography>{o.customerName}<br/>{o.customerPhone}</Typography></Td>
                <Td><Typography>{DELIVERY_LABEL[o.deliveryMethod] ?? o.deliveryMethod}</Typography></Td>
                <Td><Typography>{o.totalRub.toLocaleString('ru-RU')} ₽</Typography></Td>
                <Td><Typography>{o.itemsCount}</Typography></Td>
                <Td><Badge backgroundColor={`${STATUS_COLOR[o.status]}100`} textColor={`${STATUS_COLOR[o.status]}700`}>{STATUS_LABEL[o.status] ?? o.status}</Badge></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
      <Flex paddingTop={4} gap={2}>
        <Button variant="tertiary" disabled={filters.offset === 0}
          onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - PAGE) }))}>← Назад</Button>
        <Typography>{filters.offset + 1}–{Math.min(filters.offset + PAGE, state.total)} из {state.total}</Typography>
        <Button variant="tertiary" disabled={filters.offset + PAGE >= state.total}
          onClick={() => setFilters((f) => ({ ...f, offset: f.offset + PAGE }))}>Вперёд →</Button>
      </Flex>
    </Box>
  );
}
```

- [ ] **Step 4: App.jsx — список ⇄ карточка**

```jsx
import { useState } from 'react';
import OrdersList from './OrdersList';
import OrderDetail from './OrderDetail';

export default function App() {
  const [openedId, setOpenedId] = useState(null);
  return openedId
    ? <OrderDetail id={openedId} onBack={() => setOpenedId(null)} />
    : <OrdersList onOpen={setOpenedId} />;
}
```

(OrderDetail появится в Task 6 — до того временно `const OrderDetail = () => null;` НЕ заводить: Task 6 идёт следом в той же ветке, сборку гоняем после него.)

- [ ] **Step 5: смоук develop** — список реальных заказов прода читается, фильтры и пагинация работают, бейджи русские.
- [ ] **Step 6: Commit** `feat(strapi/orders): список заказов — таблица, фильтры, поллинг`.

---

### Task 6: UI — карточка заказа: сборка, фискализация, статусы

**Files:**
- Create: `apps/strapi/src/plugins/orders/admin/src/pages/OrderDetail.jsx`
- Create: `apps/strapi/src/plugins/orders/admin/src/components/MarkCodes.jsx`

- [ ] **Step 1: MarkCodes.jsx — поля по единицам, автопереход, сохранение**

```jsx
import { useRef, useState } from 'react';
import { Box, Typography, TextInput, Button, Flex, Badge } from '@strapi/design-system';
import { saveMarkCodes } from '../api';

/** Поля кодов Data Matrix: по одному на ЕДИНИЦУ товара. Сканер = клавиатура+Enter. */
export default function MarkCodes({ orderId, item, frozen, onSaved, onError }) {
  const [codes, setCodes] = useState(
    Array.from({ length: item.quantity }, (_, i) => item.markCodes[i] ?? ''),
  );
  const [saving, setSaving] = useState(false);
  const refs = useRef([]);

  const filled = codes.filter((c) => c.trim()).length;

  async function persist() {
    setSaving(true);
    try {
      const r = await saveMarkCodes(orderId, item.id, codes.map((c) => c.trim()).filter(Boolean));
      onSaved(r);
    } catch (e) {
      onError(e?.response?.data?.error || 'Не удалось сохранить коды');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box paddingTop={2}>
      <Flex gap={2}>
        <Typography fontWeight="bold">Коды «Честного знака»</Typography>
        <Badge>{filled} из {item.quantity}</Badge>
      </Flex>
      {codes.map((code, i) => (
        <Box key={i} paddingTop={1}>
          <TextInput
            ref={(el) => (refs.current[i] = el)}
            placeholder={`Код единицы ${i + 1} — пикните сканером`}
            value={code}
            disabled={frozen || saving}
            onChange={(e) => {
              const next = [...codes];
              next[i] = e.target.value;
              setCodes(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                refs.current[i + 1]?.focus?.();
              }
            }}
          />
        </Box>
      ))}
      {!frozen && (
        <Box paddingTop={2}>
          <Button variant="secondary" loading={saving} onClick={persist}>Сохранить коды</Button>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: OrderDetail.jsx**

```jsx
import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Button, Flex, Badge, Loader, Dialog, Textarea, Divider,
} from '@strapi/design-system';
import { fetchOrder, fiscalize, setStatus } from '../api';
import { STATUS_LABEL, STATUS_COLOR, DELIVERY_LABEL, PAYMENT_LABEL, NEXT_STATUSES } from '../labels';
import MarkCodes from '../components/MarkCodes';

export default function OrderDetail({ id, onBack }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    try { setOrder(await fetchOrder(id)); setError(null); }
    catch (e) { setError(e?.response?.data?.error || 'Не удалось загрузить заказ'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!order) return <Box padding={8}>{error ? <Typography textColor="danger600">{error}</Typography> : <Loader>Загрузка…</Loader>}</Box>;

  const marked = order.items.filter((i) => i.isMarked);
  const allCodesIn = marked.every((i) => (i.markCodes?.length ?? 0) >= i.quantity);
  const act = async (fn, okMsg) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); if (okMsg) setError(null); }
    catch (e) { setError(e?.response?.data?.error || 'Не получилось — повторите'); }
    finally { setBusy(false); }
  };

  return (
    <Box padding={8}>
      <Button variant="tertiary" onClick={onBack}>← К списку</Button>
      <Flex gap={3} paddingTop={2}>
        <Typography variant="alpha" tag="h1">{order.orderNumber}</Typography>
        <Badge backgroundColor={`${STATUS_COLOR[order.status]}100`} textColor={`${STATUS_COLOR[order.status]}700`}>
          {STATUS_LABEL[order.status]}
        </Badge>
      </Flex>
      {error && <Box paddingTop={2}><Typography textColor="danger600">{error}</Typography></Box>}

      <Box paddingTop={4}>
        <Typography variant="beta">Клиент и получение</Typography>
        <Typography tag="p">{order.customer.name} · {order.customer.phone}{order.customer.email ? ` · ${order.customer.email}` : ''}</Typography>
        <Typography tag="p">{DELIVERY_LABEL[order.deliveryMethod]}{order.deliveryAddress ? ` — ${order.deliveryAddress}` : ''}</Typography>
        <Typography tag="p">Оплата: {PAYMENT_LABEL[order.paymentMethod]}{order.paidAt ? ` (оплачен ${new Date(order.paidAt).toLocaleString('ru-RU')})` : ''}</Typography>
        {order.comment && <Typography tag="p">Комментарий: {order.comment}</Typography>}
        {order.cancelReason && <Typography tag="p" textColor="danger600">Причина отмены: {order.cancelReason}</Typography>}
      </Box>

      <Box paddingTop={4}>
        <Typography variant="beta">Позиции</Typography>
        {order.items.map((i) => (
          <Box key={i.id} paddingTop={2}>
            <Typography>{i.name} — {i.quantity} {i.unit} × {i.priceRub.toLocaleString('ru-RU')} ₽ = {i.sumRub.toLocaleString('ru-RU')} ₽ {i.isMarked && <Badge>маркировка</Badge>}</Typography>
            {i.isMarked && order.fiscalizationRequired && (
              <MarkCodes orderId={order.id} item={i} frozen={!!order.fiscalReceiptId || order.fiscalizationInProgress}
                onSaved={() => load()} onError={setError} />
            )}
          </Box>
        ))}
        <Divider paddingTop={2} />
        <Typography tag="p">Товары: {order.totals.subtotalRub.toLocaleString('ru-RU')} ₽
          {order.totals.discountRub > 0 && <> · Скидка{order.promoCode ? ` (${order.promoCode})` : ''}: −{order.totals.discountRub.toLocaleString('ru-RU')} ₽</>}
          {order.totals.deliveryRub > 0 && <> · Доставка: {order.totals.deliveryRub.toLocaleString('ru-RU')} ₽</>}
        </Typography>
        <Typography fontWeight="bold">Итого: {order.totals.totalRub.toLocaleString('ru-RU')} ₽</Typography>
      </Box>

      {order.fiscalizationRequired && (
        <Box paddingTop={4}>
          <Typography variant="beta">Фискализация (маркировка)</Typography>
          {order.fiscalReceiptId
            ? <Badge backgroundColor="success100" textColor="success700">Чек выбит: {order.fiscalReceiptId}</Badge>
            : order.fiscalizationInProgress
              ? <Badge backgroundColor="warning100" textColor="warning700">Чек уходит… обновите через минуту</Badge>
              : (
                <Box paddingTop={2}>
                  {!allCodesIn && <Typography tag="p">Отсканируйте коды всех маркированных единиц и сохраните их — тогда кнопка станет активной.</Typography>}
                  <Button disabled={!allCodesIn || busy} loading={busy}
                    onClick={() => { if (window.confirm('Выбить чек с кодами маркировки? Действие необратимо.')) act(() => fiscalize(order.id)); }}>
                    Фискализировать
                  </Button>
                </Box>
              )}
        </Box>
      )}

      <Box paddingTop={4}>
        <Typography variant="beta">Действия</Typography>
        <Flex gap={2} paddingTop={2}>
          {NEXT_STATUSES[order.status].filter((s) => s !== 'cancelled').map((s) => (
            <Button key={s} disabled={busy} onClick={() => act(() => setStatus(order.id, s))}>
              → {STATUS_LABEL[s]}
            </Button>
          ))}
          {NEXT_STATUSES[order.status].includes('cancelled') && (
            <Button variant="danger" disabled={busy} onClick={() => setCancelOpen(true)}>Отменить заказ</Button>
          )}
        </Flex>
      </Box>

      {cancelOpen && (
        <Box paddingTop={2}>
          <Textarea placeholder="Причина отмены (обязательно)" value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)} />
          <Flex gap={2} paddingTop={2}>
            <Button variant="danger" disabled={!cancelReason.trim() || busy}
              onClick={() => act(() => setStatus(order.id, 'cancelled', cancelReason.trim())).then(() => setCancelOpen(false))}>
              Подтвердить отмену
            </Button>
            <Button variant="tertiary" onClick={() => setCancelOpen(false)}>Не отменять</Button>
          </Flex>
        </Box>
      )}
    </Box>
  );
}
```

Примечание исполнителю: если компоненты `Dialog`/`Badge` в установленной версии design-system имеют другой API — проверить по `node_modules/@strapi/design-system` и поправить импорты, поведение сохранить (Dialog в коде выше не используется — подтверждение отмены сделано инлайн-блоком, `window.confirm` только для фискализации).

- [ ] **Step 3: смоук develop против прода (только чтение)** — открыть реальный заказ (например, отменённый ТЕСТ-46): карточка полная, суммы/подписи русские, кнопки соответствуют статусу (у cancelled — никаких).
- [ ] **Step 4: `bun test src/plugins/orders`** — 7 pass (не сломано).
- [ ] **Step 5: Commit** `feat(strapi/orders): карточка заказа — сборка, фискализация, статусы`.

---

### Task 7: Удаление Lovable-мокапа `/admin` из фронта

**Files:**
- Delete: `apps/frontend/src/routes/admin.tsx`

- [ ] **Step 1:** `git rm apps/frontend/src/routes/admin.tsx`
- [ ] **Step 2:** проверить, что на роут никто не ссылается: `grep -rn '"/admin"' apps/frontend/src` → ожидание: пусто (кроме удалённого файла).
- [ ] **Step 3:** сборка фронта: `cd apps/frontend && VITE_API_URL=https://ecomarket-altai.ru/api/v1 bun run build` → EXIT 0.
- [ ] **Step 4: Commit** `chore(frontend): удалить Lovable-мокап /admin (решение проджекта — админка в Strapi)`.

---

### Task 8: Прод-сборка Strapi и деплой (Strapi + фронт)

- [ ] **Step 1: прод-сборка Strapi локально** — `cd apps/strapi && bun run build` → EXIT 0 (собирается админ-панель с плагином и dist сервера).
- [ ] **Step 2: бэкап на сервере**

```bash
ssh -i ~/.ssh/avis_vps root@201.51.29.69 '
cd /opt/altai/apps/strapi
tar czf /opt/altai/backups/strapi-pre-orders-$(date +%Y%m%d-%H%M).tgz dist build src config package.json 2>/dev/null || true
cp .env .env.bak-orders'
```

- [ ] **Step 3: залить артефакты**

```bash
cd "C:/kipu/learn/Claude projects/Жемчужина Алтая/altay-gem/apps/strapi"
tar czf "$TMP/strapi-orders.tgz" dist build src/plugins config
scp -i ~/.ssh/avis_vps "$TMP/strapi-orders.tgz" root@201.51.29.69:/opt/altai/apps/strapi/
ssh -i ~/.ssh/avis_vps root@201.51.29.69 'cd /opt/altai/apps/strapi && tar xzf strapi-orders.tgz && rm strapi-orders.tgz'
```
(поверх; node_modules не трогаем — новых зависимостей нет).
- [ ] **Step 4: env Strapi на сервере** — добавить в `/opt/altai/apps/strapi/.env`:

```bash
ssh -i ~/.ssh/avis_vps root@201.51.29.69 '
PW=$(grep -E "^ADMIN_PASSWORD=" /opt/altai/apps/backend/.env | cut -d= -f2-)
grep -q ORDERS_ADMIN_PASSWORD /opt/altai/apps/strapi/.env || cat >> /opt/altai/apps/strapi/.env <<EOF

# --- плагин «Заказы» (мост к бэкенду) ---
ORDERS_API_URL=http://127.0.0.1:3002/api/v1
ORDERS_ADMIN_PASSWORD=$PW
EOF'
```

- [ ] **Step 5: рестарт + проверка** — `pm2 restart altai-strapi`; `pm2 logs altai-strapi --lines 30 --nostream` без ошибок; админка `https://altai-admin.201-51-29-69.sslip.io/admin` открывается (точный домен сверить в nginx: `grep -n server_name /etc/nginx/sites-available/altai.conf`); в меню «Заказы»; список реальных заказов грузится.
- [ ] **Step 6: деплой фронта** (без мокапа): tar свежего `.output` → scp → staging-swap как в Этапе 3 → `pm2 restart altai-web` → `https://ecomarket-altai.ru/admin` теперь 404 (мокапа нет) — ожидаемо.
- [ ] **Step 7: Commit-теги** — `git tag deploy-strapi-orders && git log --oneline -1`.

---

### Task 9: Живой приёмочный прогон на проде (тестовые ключи)

Полный сценарий приёмки маркированного — то, что раньше нельзя было прогнать без экрана.

- [ ] **Step 1:** найти маркированный товар с остатком (по SSH на 201.51.29.69):

```bash
DBURL=$(grep -E '^DATABASE_URL=' /opt/altai/apps/backend/.env | cut -d= -f2-)
psql "$DBURL" -c "select name, match_key, quantity from evotor_products
  where is_marked=true and is_archived=false and allow_to_sell=true and quantity >= 2
  order by quantity desc limit 10"
```
Затем сверить, что товар виден на витрине: `curl -s 'https://ecomarket-altai.ru/api/v1/catalog?q=<название>'` → взять его `slug` для заказа. Если ни один маркированный не виден на витрине (не обогащён в Strapi) — временно опубликовать один в Strapi (галочка публикации), после прогона вернуть как было.
- [ ] **Step 2:** через сайт (playwright-скрипт `prod-smoke-order.mjs`, товар заменить на маркированный) создать заказ «ТЕСТ Этап3-маркир», оплатить тестовой картой `2202474301322987`, доставить notification на вебхук (как в прогоне 20.07) → заказ `paid`.
- [ ] **Step 3:** в админке Strapi (реальный браузер пользователя или playwright): «Заказы» → карточка → статус «Собирается» → ввести фейк-коды (`0104603721001234215test1…`) в поля → «Сохранить коды» → счётчик N из N → «Фискализировать» → подтверждение → плашка «Чек выбит: rc_…».
- [ ] **Step 4:** негативные проверки: (а) ДО фискализации попытка «→ Готов к выдаче» → красный текст «Сначала отсканируйте коды и выбейте чек…»; (б) повторный «Фискализировать» → тот же чек (`already`), не второй; (в) после чека «Отменить» не предлагается/отказ с текстом про чек возврата.
- [ ] **Step 5:** «→ Готов к выдаче» (гейт пропускает) → «→ Выполнен». Проверить чек в ЮKassa: `GET /receipts?payment_id=…` → 1 чек `payment/succeeded` (тестовая касса).
- [ ] **Step 6: уборка** — резерв committed при «Выполнен» (остаток выправит ночная сверка), заказ остаётся в истории как выполненный тестовый; пометить в памяти.
- [ ] **Step 7:** финальные гейты: `bun test src` (backend, 270), `bun test src/plugins/orders` (strapi, 7), сборки. Обновить память и чеклист приёмки. Commit `docs: прогон приёмки маркированного пройден`.

---

## Definition of Done

- Заказчица под своим логином Strapi проходит весь путь маркированного заказа без технических слов.
- Прогон Task 9 (позитив + 3 негатива) пройден на проде с тестовыми ключами.
- Юниты: backend 270 + strapi-plugin 7 — зелёные; сборки Strapi и фронта — зелёные.
- Lovable-мокап удалён; коммиты по задачам; артефакты прод-серверов обновлены с бэкапами.
