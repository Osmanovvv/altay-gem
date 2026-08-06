import { getFetchClient } from '@strapi/strapi/admin';

// Все запросы — через getFetchClient: он сам подставляет админ-JWT (Bearer)
// и base URL; голый fetch вернул бы 401.
// У getFetchClient НЕТ метода patch (только get/post/put/del — проверено по
// node_modules/@strapi/admin/dist/admin/src/utils/getFetchClient.d.ts),
// поэтому мутации статуса и кодов идут PUT'ом в PUT-алиасы server/index.js
// (те же handlers, что и у PATCH-рут).

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
  const { put } = getFetchClient();
  const { data } = await put(`${base}/orders/${id}/items/${itemId}/mark-codes`, { codes });
  return data;
}

export async function fiscalize(id) {
  const { post } = getFetchClient();
  const { data } = await post(`${base}/orders/${id}/fiscalize`);
  return data;
}

export async function setStatus(id, status, reason) {
  const { put } = getFetchClient();
  const { data } = await put(`${base}/orders/${id}/status`, { status, reason });
  return data;
}

// ---- синхронизация с Эвотором ----

export async function fetchEvotorStatus() {
  const { get } = getFetchClient();
  const { data } = await get(`${base}/evotor/status`);
  return data;
}

/** Файл уходит base64 в JSON — см. комментарий в server/index.js. */
export async function uploadExport(storeId, file) {
  const { post } = getFetchClient();
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('не удалось прочитать файл'));
    // result: "data:...;base64,XXXX" — нужен только хвост.
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
  const { data } = await post(`${base}/evotor/upload`, {
    storeId,
    filename: file.name,
    base64,
  });
  return data;
}

export async function runReconcile() {
  const { post } = getFetchClient();
  const { data } = await post(`${base}/evotor/reconcile`);
  return data;
}
