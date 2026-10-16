/**
 * Догрузка каталога порциями — кнопка «Показать ещё» в мини-аппе MAX.
 *
 * ЗАЧЕМ. Каталог мини-аппа брал только первую страницу (48 товаров) и дальше
 * не пускал: в «Здоровье Алтая» из ~180 товаров видны были первые 48, хотя
 * «Найдено товаров» показывало полное число. Заказчица заводила карточку,
 * открывала группу — и не находила её, а поиском находила (16.10.2026).
 *
 * Между запросами выдача может сдвинуться (товар кончился и уехал в конец
 * списка), поэтому одна позиция способна прийти на двух страницах подряд.
 * Повтор отбрасываем по slug: иначе дубль в списке и одинаковые ключи React.
 */

interface PageLike<T> {
  items: T[];
  pagination: { page: number; pageCount: number; total: number };
}

export interface LoadedList<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

export function firstPage<T extends { slug: string }>(res: PageLike<T>): LoadedList<T> {
  return {
    items: res.items,
    page: res.pagination.page,
    pageCount: res.pagination.pageCount,
    total: res.pagination.total,
  };
}

export function appendPage<T extends { slug: string }>(
  prev: LoadedList<T>,
  res: PageLike<T>,
): LoadedList<T> {
  const seen = new Set(prev.items.map((i) => i.slug));
  return {
    items: [...prev.items, ...res.items.filter((i) => !seen.has(i.slug))],
    page: res.pagination.page,
    pageCount: res.pagination.pageCount,
    total: res.pagination.total,
  };
}

export function hasMore(list: LoadedList<unknown>): boolean {
  return list.page < list.pageCount;
}
