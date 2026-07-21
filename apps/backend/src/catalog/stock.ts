/**
 * Буфер доступного к продаже остатка (этап 2, ТЗ п.8, Путь B).
 *
 * Под Путём B запись остатка в Эвотор невозможна (это роль товароучётки —
 * конфликт с системой заказчицы), поэтому есть окно двойной продажи последнего
 * экземпляра: офлайн-касса и онлайн-заказ могут забрать его одновременно.
 * Буфер придерживает N единиц (по умолчанию 1) — их не показываем к продаже и
 * не даём заказать; фактическое списание онлайн-продажи пройдёт офлайн-чеком.
 */

/** Доступное к продаже за вычетом буфера. Никогда не отрицательное. */
export function applyStockBuffer(sellableQty: number, buffer: number): number {
  return Math.max(0, sellableQty - Math.max(0, buffer));
}

/**
 * Масса порции весового товара в граммах: положительная или дефолт 100.
 * 0/пусто/отрицательное — ошибка данных: без защиты portionKg=0 давал бы
 * деление на ноль → Infinity доступных единиц, обходя буфер (перепродажа).
 */
export function safePortionMassG(v: number | null | undefined): number {
  return typeof v === 'number' && v > 0 ? v : 100;
}

/**
 * Доступно к ЗАКАЗУ в единицах продажи (штуки или порции): floor по порциям
 * ДО буфера, буфер по-магазинно. Единственный источник этой математики —
 * используют витрина (карточка/разбивка по точкам), create() и quote:
 * расхождение «показали 4, а заказать можно 2» исключается конструктивно.
 *
 * Весовой считается граммами-первыми: float-деление 2.3/0.1=22.999… съедало
 * порцию при floor; умножение на 1000 до деления держит значения целыми.
 */
export function orderableUnits(input: {
  /** Физостаток минус активные резервы, в шт или кг. */
  availableQty: number;
  measure: string;
  portionMassG: number | null | undefined;
  buffer: number;
}): number {
  const isWeight = input.measure === 'кг';
  const raw = isWeight
    ? Math.floor(
        (input.availableQty * 1000) / safePortionMassG(input.portionMassG),
      )
    : Math.floor(input.availableQty);
  return applyStockBuffer(raw, input.buffer);
}
