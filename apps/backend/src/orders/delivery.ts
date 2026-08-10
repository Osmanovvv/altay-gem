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
  /**
   * Вес единицы, г: для весовых — масса порции; для штучных — вес из карточки.
   * null — вес НЕ задан. Не подставляем догадку: ТЗ р.12 требует считать по
   * массам товаров, а угаданный вес даёт неверную цену доставки в обе стороны
   * и молча.
   */
  unitWeightG: number | null;
  isPerishable: boolean;
}

export class DeliveryNotAvailableError extends Error {
  constructor(
    public readonly code:
      | 'PERISHABLE_RUSSIA_BLOCKED'
      | 'NO_TARIFF'
      | 'WEIGHT_LIMIT'
      | 'WEIGHT_UNKNOWN',
    message: string,
  ) {
    super(message);
  }
}

/** Число из Strapi: decimal приходит строкой, пустое — как '' или null. */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Приведение сырых тарифов Strapi к числам.
 *
 * Strapi на Postgres отдаёт decimal СТРОКОЙ. Если строка доедет до арифметики,
 * `subtotal - discount + delivery` превратится в склейку строк и в заказ уйдёт
 * бессмысленная сумма. Раньше приводились только цена курьера и порог, а тиры
 * прокидывались приведением типа — здесь эта асимметрия и закрывается.
 * Битые тиры отбрасываем: пустая сетка честно даст NO_TARIFF, а NaN в цене —
 * нет.
 */
export function normalizeTariffs(raw: Record<string, unknown>): DeliveryTariffs {
  const rawTiers = Array.isArray(raw.russiaWeightTiers)
    ? raw.russiaWeightTiers
    : [];
  const russiaWeightTiers = rawTiers
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const weightUpToG = num(o.weightUpToG);
      const priceRub = num(o.priceRub);
      if (weightUpToG === null || weightUpToG <= 0) return null;
      if (priceRub === null || priceRub < 0) return null;
      return { weightUpToG, priceRub };
    })
    .filter((t): t is { weightUpToG: number; priceRub: number } => t !== null);

  return {
    courierNskPriceRub: num(raw.courierNskPriceRub) ?? 0,
    // null — «порога нет»; подставить 0 значило бы «доставка всегда бесплатна».
    freeDeliveryThresholdRub: num(raw.freeDeliveryThresholdRub),
    russiaWeightTiers,
  };
}

/** Вес заказа, г. null — хотя бы у одной позиции вес не задан. */
export function orderWeightG(lines: DeliveryLine[]): number | null {
  let sum = 0;
  for (const l of lines) {
    if (l.unitWeightG === null) return null;
    sum += l.unitWeightG * l.quantity;
  }
  return sum;
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
  if (weight === null) {
    throw new DeliveryNotAvailableError(
      'WEIGHT_UNKNOWN',
      'Для одного из товаров не указан вес, поэтому доставку по России посчитать нельзя. Выберите самовывоз или доставку по Новосибирску, либо свяжитесь с нами',
    );
  }
  const tier = tiers.find((t) => weight <= t.weightUpToG);
  if (!tier) {
    // Сетка тарифов описывает то, что магазин умеет отправлять. Раньше заказ
    // тяжелее верхнего тира считался ПО ВЕРХНЕМУ — посылка 15 кг уезжала по
    // цене пятикилограммовой, а верхней границы массы нет и в DTO. Потолок
    // задаёт админка: добавили тир потяжелее — отказ снялся.
    throw new DeliveryNotAvailableError(
      'WEIGHT_LIMIT',
      `Заказ весит ${(weight / 1000).toFixed(1)} кг — это больше, чем мы отправляем по России обычной посылкой. Пожалуйста, свяжитесь с нами: рассчитаем отправку индивидуально`,
    );
  }
  return tier.priceRub;
}
