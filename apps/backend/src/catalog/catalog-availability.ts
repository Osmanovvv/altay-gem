import type { PickupPoint } from '../orders/pickup-points';
import { orderableUnits } from './stock';

/**
 * По-магазинная доступность товара (недочёт #5 ТЗ / #37).
 * Буфер и порции применяются ПО КАЖДОМУ магазину (как при заказе), агрегат =
 * сумма: витрина не обещает количество, недостижимое ни из одной точки.
 * Агрегат — по ВСЕМ магазинам (ТЗ:266), разбивка — только по точкам самовывоза.
 */
export function perStoreAvailability(input: {
  /** Кг/шт по магазинам, резервы уже вычтены (может быть отрицательным). */
  perStoreQty: Array<{ storeId: string; qty: number }>;
  measure: string;
  portionMassG: number | null | undefined;
  buffer: number;
  pickupStores: Array<{ point: PickupPoint; storeId: string }>;
}): {
  totalUnits: number;
  pickupAvailability: Array<{ point: PickupPoint; availableQty: number }>;
} {
  const unitsByStore = new Map<string, number>();
  // Дубли номенклатуры внутри магазина: каждая строка буферизуется отдельно —
  // консервативно (create() читает rows[0], меньше обещаем — не перепродадим).
  for (const { storeId, qty } of input.perStoreQty) {
    unitsByStore.set(
      storeId,
      (unitsByStore.get(storeId) ?? 0) +
        orderableUnits({
          availableQty: qty,
          measure: input.measure,
          portionMassG: input.portionMassG,
          buffer: input.buffer,
        }),
    );
  }
  const totalUnits = [...unitsByStore.values()].reduce((s, v) => s + v, 0);
  const pickupAvailability = input.pickupStores.map(({ point, storeId }) => ({
    point,
    availableQty: unitsByStore.get(storeId) ?? 0,
  }));
  return { totalUnits, pickupAvailability };
}
