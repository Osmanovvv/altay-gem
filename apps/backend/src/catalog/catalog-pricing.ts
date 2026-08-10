/**
 * Правило показа «старой цены» и бейджа «-N%» на витрине.
 *
 * Чистая функция рядом со stock.ts / catalog-availability.ts — считается
 * ТОЛЬКО на сервере (ТЗ р.4: витрина бизнес-логики не содержит), результат
 * уходит в карточку готовыми полями.
 *
 * Единственное правило: зачёркнутая цена показывается, лишь когда она строго
 * больше текущей и разница различима в процентах. Цену в кассе меняет Эвотор,
 * а старую вписывает человек в Strapi — рассинхрон неизбежен, и вести себя
 * при нём надо тихо (ничего не показать), а не рисовать «скидку наоборот».
 */
import { safePortionMassG } from './stock';

/**
 * Цена карточки в рублях.
 *
 * Эвотор хранит цену весового товара за килограмм, а витрина продаёт порциями
 * (ТЗ р.6.4), поэтому у весовых показывается цена порции. Формула живёт здесь
 * одна на всех: её же использует подсказка контент-менеджеру при вводе старой
 * цены — иначе админка проверяла бы ввод против цены за килограмм, а покупатель
 * видел бы цену за порцию.
 */
export function cardPriceRub(input: {
  priceKopecks: number;
  measure: string;
  portionMassG: number | null | undefined;
}): number {
  const rub = input.priceKopecks / 100;
  if (input.measure !== 'кг') return Math.round(rub);
  return Math.round(rub * (safePortionMassG(input.portionMassG) / 1000));
}

export interface OldPriceView {
  /** Зачёркнутая цена для витрины; null — не показывать. */
  oldPriceRub: number | null;
  /** Готовая строка бейджа «-N%»; null — бейджа нет. */
  discountBadge: string | null;
}

const NOTHING: OldPriceView = { oldPriceRub: null, discountBadge: null };

export function displayOldPrice(input: {
  oldPriceRub: number | null | undefined;
  priceRub: number;
}): OldPriceView {
  const { oldPriceRub, priceRub } = input;

  if (!Number.isFinite(priceRub) || priceRub <= 0) return NOTHING;
  if (oldPriceRub == null || !Number.isFinite(oldPriceRub)) return NOTHING;
  if (oldPriceRub <= 0) return NOTHING;
  // Старая не выше текущей — скидки нет (цену подняли либо вписали неверно).
  if (oldPriceRub <= priceRub) return NOTHING;

  const percent = Math.round((1 - priceRub / oldPriceRub) * 100);
  // «-0%» — мусор на карточке: разница есть, но для покупателя её нет.
  if (percent < 1) return NOTHING;

  return { oldPriceRub, discountBadge: `-${percent}%` };
}
