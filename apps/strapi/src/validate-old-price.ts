/**
 * Правило ввода старой цены в админке.
 *
 * Зачёркнутая цена на витрине показывается, только пока она выше текущей
 * (backend/src/catalog/catalog-pricing.ts). Значит вводить меньшее значение
 * бессмысленно, и узнать об этом человек должен сразу в форме, а не по
 * отсутствию бейджа на карточке.
 *
 * Отдельным модулем — чтобы правило и текст ошибки были покрыты тестами:
 * lifecycle Strapi тестами не накрыть.
 */
export interface OldPriceInput {
  oldPriceRub?: number | string | null;
}

export interface ReplicaPrice {
  /** Цена, которую видит покупатель: у весового — за порцию. */
  priceRub?: number;
  isWeight?: boolean;
}

/** Сообщение об ошибке для админки или null, если всё в порядке. */
export function oldPriceProblem(
  data: OldPriceInput,
  product: ReplicaPrice,
): string | null {
  if (data.oldPriceRub === null || data.oldPriceRub === undefined) return null;

  const oldPrice = Number(data.oldPriceRub);
  const current = product.priceRub;
  // Мусор в поле и неизвестная цена товара сохранение не блокируют: пустое
  // поле безопасно, а ронять правку карточки из-за сбоя моста нельзя.
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) return null;
  if (typeof current !== 'number' || !Number.isFinite(current) || current <= 0) {
    return null;
  }
  if (oldPrice > current) return null;

  const perPortion = product.isWeight ? ' (за порцию, не за килограмм)' : '';
  return (
    `Старая цена ${oldPrice} ₽ не больше текущей цены товара — ${current} ₽${perPortion}. ` +
    'Зачёркнутая цена показывается, только когда она выше нынешней. ' +
    'Либо укажите цену, которая действительно действовала раньше, либо очистите поле.'
  );
}
