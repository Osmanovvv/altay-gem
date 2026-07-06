/**
 * Чистый расчёт доставки (ТЗ р.12) — без I/O, покрыт юнит-тестами.
 * Тарифы приходят из Strapi (управляются контент-менеджером).
 */

export type DeliveryMethod =
  | 'pickup_leningradskaya'
  | 'pickup_titova'
  | 'courier_nsk'
  | 'russia';

export interface DeliveryTariffs {
  courierNskPriceRub: number;
  freeDeliveryThresholdRub: number | null;
  /** Сетка «до N грамм → цена», отсортируется по весу. */
  russiaWeightTiers: Array<{ weightUpToG: number; priceRub: number }>;
}

export interface DeliveryLine {
  quantity: number;
  /** Вес единицы, г: для весовых — масса порции; для штучных — вес из карточки. */
  unitWeightG: number;
  isPerishable: boolean;
}

export class DeliveryNotAvailableError extends Error {
  constructor(
    public readonly code: 'PERISHABLE_RUSSIA_BLOCKED' | 'NO_TARIFF',
    message: string,
  ) {
    super(message);
  }
}

export function orderWeightG(lines: DeliveryLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitWeightG * l.quantity, 0);
}

/**
 * Стоимость доставки в рублях.
 * @param subtotalAfterDiscountRub — сумма товаров после скидки промокода
 *   (порог бесплатной доставки считается от неё)
 */
export function calcDelivery(
  method: DeliveryMethod,
  lines: DeliveryLine[],
  tariffs: DeliveryTariffs,
  subtotalAfterDiscountRub: number,
): number {
  if (method === 'pickup_leningradskaya' || method === 'pickup_titova') {
    return 0; // самовывоз бесплатно (ТЗ р.12)
  }

  if (method === 'courier_nsk') {
    const threshold = tariffs.freeDeliveryThresholdRub;
    if (threshold != null && subtotalAfterDiscountRub >= threshold) return 0;
    return tariffs.courierNskPriceRub;
  }

  // russia: скоропортящиеся — только НСК и самовывоз (ТЗ р.12)
  if (lines.some((l) => l.isPerishable)) {
    throw new DeliveryNotAvailableError(
      'PERISHABLE_RUSSIA_BLOCKED',
      'Скоропортящиеся товары доставляются только по Новосибирску и самовывозом',
    );
  }
  const tiers = [...tariffs.russiaWeightTiers].sort(
    (a, b) => a.weightUpToG - b.weightUpToG,
  );
  if (tiers.length === 0) {
    throw new DeliveryNotAvailableError(
      'NO_TARIFF',
      'Тарифы доставки по России не настроены',
    );
  }
  const weight = orderWeightG(lines);
  const tier = tiers.find((t) => weight <= t.weightUpToG);
  // тяжелее максимального тира — по максимальному (уточнение тарифа — за админкой)
  return (tier ?? tiers[tiers.length - 1]).priceRub;
}
