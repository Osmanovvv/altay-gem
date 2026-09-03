/**
 * Порядок карточек в каталоге.
 *
 * Наличие важнее выбранной сортировки. Пока в каталоге было девять товаров,
 * порядок ничего не решал; после загрузки из выгрузки их стало под пятьсот, и
 * сортировка «сначала дешёвые» вывела наверх распроданное — покупатель видел
 * стену карточек «Нет в наличии», ни одну из которых нельзя купить.
 *
 * Поэтому сначала делим на доступные и распроданные, а выбранную сортировку
 * применяем ВНУТРИ каждой части: распроданные тоже упорядочены, просто ниже.
 */

export type SortKey = 'price_asc' | 'price_desc' | 'name';

interface Sortable {
  name: string;
  priceRub: number;
  inStock: boolean;
}

const COMPARATORS: Record<SortKey, (a: Sortable, b: Sortable) => number> = {
  price_asc: (a, b) => a.priceRub - b.priceRub,
  price_desc: (a, b) => b.priceRub - a.priceRub,
  name: (a, b) => a.name.localeCompare(b.name, 'ru'),
};

export function sortCards<T extends Sortable>(items: T[], sort: SortKey): T[] {
  const inner = COMPARATORS[sort] ?? COMPARATORS.price_asc;
  return [...items].sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return inner(a, b);
  });
}
