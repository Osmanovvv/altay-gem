/**
 * Поиск по каталогу (ТЗ р.6.9): по названию, подкатегории и описанию.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ДВЕ СТРОКИ В КОНТРОЛЛЕРЕ. Сравнение шло «как
 * есть», и это ломало поиск ровно на главном товаре магазина: категория
 * называется «Мёд и пчелопродукция», а в кассе товары заведены как «Мед
 * Донник», «Мед Акация» — кассиру некогда искать «ё». Покупатель читал название
 * категории, набирал «мёд» и получал пусто, хотя мёда в каталоге 19 позиций.
 *
 * Поэтому перед сравнением обе стороны приводятся к одному виду: нижний
 * регистр и «ё» → «е». Пока каталог был на девять товаров, это не проявлялось.
 */

export function normalizeForSearch(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/ё/g, 'е');
}

interface Searchable {
  name: string;
  subcategory?: string | null;
  shortDescription?: string | null;
}

export function matchesQuery(card: Searchable, query: string): boolean {
  const q = normalizeForSearch(query).trim();
  if (!q) return true; // пустой запрос — не фильтруем
  return (
    normalizeForSearch(card.name).includes(q) ||
    normalizeForSearch(card.subcategory).includes(q) ||
    normalizeForSearch(card.shortDescription).includes(q)
  );
}
