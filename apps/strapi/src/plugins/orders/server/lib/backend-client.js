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
