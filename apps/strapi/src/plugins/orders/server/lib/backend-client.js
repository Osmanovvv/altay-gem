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

  async function call(method, path, body, auth, callTimeoutMs = timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), callTimeoutMs);
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
      let json;
      try {
        json = await res.json();
      } catch (e) {
        // обрыв/мусор в теле успешного ответа — НЕ тихий успех, пусть уйдёт в общий catch
        if (res.ok) throw e;
        json = {};
      }
      if (!res.ok) {
        if (!json.message && res.status >= 500) {
          throw err(res.status, 'ORDERS_UNAVAILABLE', 'Сервер заказов недоступен. Повторите');
        }
        throw err(res.status, json.code, json.message || `HTTP ${res.status}`);
      }
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw err(504, 'ORDERS_TIMEOUT', 'Сервер заказов не ответил');
      // сетевой сбой (ECONNREFUSED, 'fetch failed', обрыв тела) — без сырого текста наверх
      if (e.status === undefined) throw err(502, 'ORDERS_UNAVAILABLE', 'Сервер заказов недоступен. Повторите');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  async function login() {
    if (!password) throw err(503, 'ORDERS_NOT_CONFIGURED', 'ORDERS_ADMIN_PASSWORD не задан');
    let r;
    try {
      r = await call('POST', '/admin/login', { password });
    } catch (e) {
      // 401 от самого логина = пароль ротирован; голый 401 наружу разлогинил бы админку Strapi
      if (e.status === 401) throw err(503, 'ORDERS_NOT_CONFIGURED', 'ORDERS_ADMIN_PASSWORD неверен');
      throw e;
    }
    token = r.token;
    expiresAt = r.expiresAt;
  }

  async function request(method, path, body, opts = {}) {
    if (!token || Date.now() > expiresAt - 60000) await login();
    try {
      return await call(method, path, body, token, opts.timeoutMs);
    } catch (e) {
      if (e.status !== 401) throw e;
      await login(); // токен мог протухнуть/бэкенд перезапущен — один повтор
      return call(method, path, body, token, opts.timeoutMs);
    }
  }

  return { request };
}

module.exports = { createBackendClient };
