/**
 * Разбор и очистка query-параметра `?order=<id>` для прямой ссылки из Telegram
 * на карточку заказа в плагине Strapi.
 */
export function parseOrderIdFromSearch(search) {
  if (typeof search !== 'string' || !search) return null;
  const query = search.split('#', 1)[0];
  const raw = new URLSearchParams(query).get('order')?.trim() ?? '';
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Удаляет параметр `order` из URL, сохраняя путь, остальные параметры и hash. */
export function stripOrderParamFromUrl(href) {
  if (typeof href !== 'string' || !href) return '/';
  try {
    const url = new URL(href, 'http://localhost');
    url.searchParams.delete('order');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}
