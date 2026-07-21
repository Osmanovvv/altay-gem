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

/**
 * Обёртка контроллера: прокси + перевод ошибок в понятный текст.
 * Доступ: любой аутентифицированный админ Strapi (type:'admin' даёт
 * аутентификацию до политик) — осознанно без RBAC-скоупов: магазин
 * с одним владельцем; сотрудники работают под общими аккаунтами.
 */
const proxy = (fn) => async (ctx) => {
  try {
    ctx.body = await fn(ctx, getClient());
  } catch (e) {
    // Первопричину (ECONNREFUSED и т.п.) — в лог, кассиру — человеческий текст.
    strapi.log.error(`orders-прокси: ${e.message}${e.cause ? ` (cause: ${e.cause?.code ?? e.cause})` : ''}`);
    ctx.status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
    const text =
      e.status >= 500 && !e.code
        ? 'Сервер заказов недоступен. Повторите' // необработанный 500 бэкенда — не показываем «Internal server error»
        : humanError(e);
    ctx.body = { error: text, code: e.code };
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
        // PUT-алиасы тех же handlers: у getFetchClient админки Strapi нет метода
        // patch (только get/post/put/del — см. @strapi/admin dist getFetchClient),
        // поэтому admin/src/api.js шлёт PUT. К бэкенду мост всё равно идёт PATCH'ем.
        { method: 'PUT', path: '/orders/:id/status', handler: 'bridge.status', config: { policies: [] } },
        { method: 'PUT', path: '/orders/:id/items/:itemId/mark-codes', handler: 'bridge.markCodes', config: { policies: [] } },
        { method: 'POST', path: '/orders/:id/fiscalize', handler: 'bridge.fiscalize', config: { policies: [] } },
      ],
    },
  },
  controllers: {
    bridge: {
      list: proxy((ctx, c) => {
        // Санация: дубль ?limit=10&limit=20 приходит массивом — берём первый;
        // limit/offset пропускаем только целыми, иначе NaN уехал бы в SQL бэкенда.
        const first = (v) => (Array.isArray(v) ? v[0] : v);
        const q = new URLSearchParams();
        for (const k of ['status', 'deliveryMethod']) {
          const v = first(ctx.query[k]);
          if (v) q.set(k, String(v));
        }
        for (const k of ['limit', 'offset']) {
          const v = first(ctx.query[k]);
          if (v !== undefined && /^\d+$/.test(String(v))) q.set(k, String(v));
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
      // Фискализация: бэкенд делает до двух вызовов ЮKassa — таймаут шире.
      fiscalize: proxy((ctx, c) =>
        c.request('POST', `/admin/orders/${Number(ctx.params.id)}/fiscalize`, undefined, { timeoutMs: 30000 }),
      ),
    },
  },
};
