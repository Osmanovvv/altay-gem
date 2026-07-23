/**
 * Распределение заказанного количества по магазинам для ДОСТАВКИ (курьер по НСК /
 * доставка по России). В отличие от самовывоза, где товар берут из конкретной
 * точки, доставку оператор собирает из любых магазинов — поэтому доступное
 * равно СУММЕ по магазинам (тот же агрегат, что показан в каталоге), а не
 * остатку одного «магазина записи товара».
 *
 * Багфикс: раньше и quote, и резерв в create() смотрели на p.storeId (склад по
 * умолчанию). Если весь остаток лежал в другом магазине, курьерский заказ
 * блокировался с «доступно 0», хотя товар был в наличии.
 *
 * Жадно: больший остаток отдаёт первым (меньше точек для сборки оператору),
 * при равенстве — по storeId по возрастанию (детерминизм для тестов и резерва).
 */
export function allocateAcrossStores(
  // `id` — непрозрачный ключ источника остатка. В quote это storeId, в create —
  // evotor_uuid конкретной строки (в одном магазине бывает несколько строк с
  // одним товаром — дубли номенклатуры; каждую резервируем по своему uuid).
  sources: Array<{ id: string; available: number }>,
  quantity: number,
): {
  ok: boolean;
  total: number;
  allocations: Array<{ id: string; qty: number }>;
} {
  const positive = sources
    .map((s) => ({ id: s.id, available: Math.max(0, s.available) }))
    .filter((s) => s.available > 0)
    .sort((a, b) =>
      b.available !== a.available
        ? b.available - a.available
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    );

  const total = positive.reduce((s, x) => s + x.available, 0);
  if (quantity <= 0) return { ok: true, total, allocations: [] };
  // Не хватает суммарно — не резервируем частично: заказ отклоняется целиком.
  if (total < quantity) return { ok: false, total, allocations: [] };

  const allocations: Array<{ id: string; qty: number }> = [];
  let remaining = quantity;
  for (const s of positive) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, s.available);
    allocations.push({ id: s.id, qty: take });
    remaining -= take;
  }
  return { ok: true, total, allocations };
}
