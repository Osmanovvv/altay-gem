/**
 * Показ зачёркнутой цены и процента скидки на витрине.
 *
 * Зеркало серверного правила (`catalog/catalog-pricing.ts`): зачёркнутая цена
 * показывается, только когда она строго больше текущей и разница различима в
 * процентах. Сервер уже отдаёт карточку по этому правилу — здесь страховка для
 * данных, которые пришли не из свежего ответа API: корзина восстанавливается
 * из localStorage, и лежащий там снимок товара переживает и смену цены в
 * кассе, и деплой.
 *
 * Держим правило в одном месте: раньше каждое из четырёх мест проверяло просто
 * «oldPrice не пустой», а карусель хитов вдобавок считала процент своей
 * формулой.
 */

/** Цена для зачёркивания или null, если скидку показывать нельзя. */
export function strikePrice(
  priceRub: number,
  oldPriceRub: number | null | undefined,
): number | null {
  if (discountPercent(priceRub, oldPriceRub) === null) return null;
  return oldPriceRub ?? null;
}

/** Величина скидки в процентах или null, если скидки нет. */
export function discountPercent(
  priceRub: number,
  oldPriceRub: number | null | undefined,
): number | null {
  if (!Number.isFinite(priceRub) || priceRub <= 0) return null;
  if (oldPriceRub == null || !Number.isFinite(oldPriceRub)) return null;
  if (oldPriceRub <= 0 || oldPriceRub <= priceRub) return null;

  const percent = Math.round((1 - priceRub / oldPriceRub) * 100);
  return percent < 1 ? null : percent;
}
