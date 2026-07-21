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
