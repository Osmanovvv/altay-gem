/**
 * Точки самовывоза и их сопоставление магазинам Эвотора (по подстроке адреса
 * из справочника evotor_stores). Единственный источник этого маппинга —
 * используют и заказы (целевой магазин списания), и каталог (разбивка
 * наличия по точкам на витрине).
 */

export type PickupPoint = 'pickup_leningradskaya' | 'pickup_titova';

export const PICKUP_STORE_HINT: Record<PickupPoint, string> = {
  pickup_leningradskaya: 'Ленинградская',
  pickup_titova: 'Титова',
};

export const PICKUP_POINTS = Object.keys(PICKUP_STORE_HINT) as PickupPoint[];

export function isPickupPoint(method: string): method is PickupPoint {
  return Object.hasOwn(PICKUP_STORE_HINT, method);
}

/** Какому магазину Эвотора соответствует каждая точка самовывоза. */
export function resolvePickupStores(
  stores: Array<{ id: string; address: string | null }>,
): Array<{ point: PickupPoint; storeId: string }> {
  const out: Array<{ point: PickupPoint; storeId: string }> = [];
  for (const point of PICKUP_POINTS) {
    const hint = PICKUP_STORE_HINT[point];
    const store = stores.find((s) => (s.address ?? '').includes(hint));
    if (store) out.push({ point, storeId: store.id });
  }
  return out;
}

/** Другая (не выбранная) точка самовывоза, если она настроена. */
export function otherPickupPoint(
  current: PickupPoint,
  resolved: Array<{ point: PickupPoint; storeId: string }>,
): { point: PickupPoint; storeId: string } | null {
  return resolved.find((r) => r.point !== current) ?? null;
}
