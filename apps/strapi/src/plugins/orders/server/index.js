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
    strapi.log.error(`orders-прокси: ${e.message}${e.cause ? ` (cause: ${e.cause})` : ''}`);
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
      // Фискализация: бэкенд делает до двух вызовов ЮKassa — таймаут шире.
      fiscalize: proxy((ctx, c) =>
        c.request('POST', `/admin/orders/${Number(ctx.params.id)}/fiscalize`, undefined, { timeoutMs: 30000 }),
      ),
    },
  },
};
