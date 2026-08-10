/**
 * Выбор строки реплики, представляющей товар на витрине.
 *
 * Номенклатура выгружена в оба магазина, поэтому на один `evotor_uuid`
 * приходится по строке на точку — с собственной ценой. Карточка витрины одна,
 * и цену она берёт из одной строки; какой именно — должно быть решено ЯВНО,
 * иначе выбор зависит от порядка выдачи Postgres (без ORDER BY он произволен)
 * и карточка меняет цену между пересборками кэша.
 *
 * Берём магазин с наименьшим `store_id`: это стабильно и не зависит ни от
 * данных, ни от плана запроса. Вопрос «какую цену показывать, если в точках
 * они разные» — экономический и решается отдельно (цена по выбранной точке
 * самовывоза); здесь только предсказуемость.
 */
export function indexReplicaByUuid<
  T extends { storeId: string; evotorUuid: string },
>(rows: readonly T[]): Map<string, T> {
  const byUuid = new Map<string, T>();
  for (const row of rows) {
    const seen = byUuid.get(row.evotorUuid);
    if (seen && seen.storeId <= row.storeId) continue;
    byUuid.set(row.evotorUuid, row);
  }
  return byUuid;
}
