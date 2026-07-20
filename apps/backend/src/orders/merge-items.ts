/**
 * Слить дубли одного товара в составе заказа: [{x,5},{x,5}] → [{x,10}].
 *
 * Зачем (находка ревью): проверка остатка в транзакции сверяет КАЖДУЮ строку
 * с остатком независимо, а резервы текущего заказа пишутся после цикла —
 * два дубля по 5 при 5 доступных проходили бы оба (оверселл: деньги приняты
 * за несуществующий товар). Фронт корзину дедуплицирует, но API публичный.
 * Слияние до всех проверок делает дубли эквивалентными одной строке.
 */
export function mergeDuplicateItems<
  T extends { id: string; quantity: number },
>(items: T[]): T[] {
  const bySlug = new Map<string, T>();
  for (const item of items) {
    const seen = bySlug.get(item.id);
    if (seen) {
      // количество суммируем; остальные поля (например priceRub для детекта
      // «цена изменилась») — из первого вхождения
      bySlug.set(item.id, { ...seen, quantity: seen.quantity + item.quantity });
    } else {
      bySlug.set(item.id, item);
    }
  }
  return [...bySlug.values()];
}
