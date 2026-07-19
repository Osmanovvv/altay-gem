/**
 * Ночная сверка остатков и цен из суточной выгрузки Эвотора
 * (этап 2, ТЗ-5, Путь B, Шаг 6).
 *
 * Под Путём B живого API остатков нет (право конфликтует с товароучёткой
 * заказчицы), поэтому полный авторитетный снимок — из Excel-выгрузки раз в
 * сутки. Внутри суток актуальность держат чеки (вебхук) и страховочный
 * поллинг; ночная сверка выравнивает накопленный дрейф «в пользу Эвотора»
 * и фиксирует расхождения в журнал. Это ФАЙЛ → НАША БД: к Эвотору не ходим,
 * соседнюю товароучётку не трогаем.
 *
 * Общее ядро для CLI первичного импорта и планировщика ночной сверки —
 * чтобы логика upsert/архивации не разъезжалась в двух местах.
 */
import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../db/database.module';
import { evotorProducts, evotorStores, syncLog } from '../db/schema';
import { archivalIsSafe, parseGoodsExportRow } from './import-goods';

/** Итог сверки одного магазина. */
export interface ReconcileSummary {
  storeId: string;
  rows: number; //            строк в выгрузке
  imported: number; //        товаров к записи (без групп/мусора)
  skipped: number; //         строк пропущено (группы/мусор)
  upserted: number; //        успешно записано
  failed: number; //          не записано (ошибки строк)
  isNew: number; //           новых товаров (не было в реплике)
  priceChanged: number; //    у скольких цена разошлась и выправлена
  qtyChanged: number; //      у скольких остаток разошёлся и выправлен
  archived: number; //        помечено is_archived (нет в выгрузке)
  archivalSkipped: boolean; //страховка: выгрузка мала — архивацию не делали
}

/**
 * Сколько мс до ближайшего запуска в локальное «ЧЧ:ММ» (для суточного
 * планировщика без внешних зависимостей). Если время уже прошло сегодня —
 * переносим на завтра; ровно «сейчас» тоже на завтра (иначе цикл в 0 мс).
 */
export function msUntilDailyRun(atHHMM: string, now: Date): number {
  const [h, m] = atHHMM.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  let diff = target.getTime() - now.getTime();
  if (diff <= 0) diff += 24 * 3_600_000;
  return diff;
}

/**
 * Свежая ли выгрузка — по времени изменения файла. Чистая функция.
 *
 * Зачем: сверка АВТОРИТЕТНА (выравнивает «в пользу Эвотора»), поэтому
 * протухший файл применять нельзя — он откатит остатки, насчитанные за день
 * живыми чеками, к старому снимку. Сломалась автодоставка → в каталоге лежит
 * вчерашний файл → без этой проверки сверка молча портит остатки КАЖДУЮ ночь
 * и рапортует «ok». Пропуск + алерт лучше тихой порчи (ср. archivalIsSafe).
 *
 * maxAgeHours = 0 — проверка выключена (ручной прогон старого файла).
 * mtime в будущем (перекос часов сервера) свежести не отменяет: расхождение
 * часов — не повод остановить сверку.
 */
export function exportIsFresh(
  mtimeMs: number,
  nowMs: number,
  maxAgeHours: number,
): boolean {
  if (maxAgeHours <= 0) return true;
  const ageMs = nowMs - mtimeMs;
  if (ageMs <= 0) return true;
  return ageMs <= maxAgeHours * 3_600_000;
}

/** Текущее состояние товара в реплике (для сравнения с выгрузкой). */
interface ReplicaSnapshot {
  priceKopecks: number;
  quantity: string;
}

/** Что выгрузка меняет в товаре (для журнала расхождений). Чистая функция. */
export function classifyReconcile(
  current: ReplicaSnapshot | undefined,
  imported: { priceKopecks: number | null; quantity: number | null },
): { isNew: boolean; priceChanged: boolean; qtyChanged: boolean } {
  if (!current) return { isNew: true, priceChanged: false, qtyChanged: false };
  // Пустое значение выгрузки не затираем (см. модуль) — и расхождением не
  // считаем: сравниваем только присутствующие в отчёте цену/остаток.
  const priceChanged =
    imported.priceKopecks !== null &&
    imported.priceKopecks !== current.priceKopecks;
  const qtyChanged =
    imported.quantity !== null &&
    Number(current.quantity) !== imported.quantity;
  return { isNew: false, priceChanged, qtyChanged };
}

/**
 * Свести реплику магазина к суточной выгрузке. rows — строки Excel как есть
 * (raw xlsx). Пишет только в НАШУ БД; сам логирует итог в sync_log.
 *
 * Порядок как в первичном импорте: метка времени ДО загрузки → upsert всех
 * товаров (цена/остаток перезаписываются авторитетно, но пустые значения
 * отчёта не затирают текущее) → архивация не тронутых импортом (страховка от
 * неполного/битого файла). Идемпотентно (PK store_id+evotor_uuid).
 */
export async function reconcileStore(
  db: Database,
  storeId: string,
  rows: Record<string, unknown>[],
): Promise<ReconcileSummary> {
  const parsed = rows
    .map(parseGoodsExportRow)
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const skipped = rows.length - parsed.length;
  // Что реально есть в выгрузке — по этому набору архивируем отсутствующих
  // (а не по метке времени, чтобы упавший upsert присутствующего не архивировал).
  const parsedUuids = parsed.map((p) => p.uuid);

  // Заглушка магазина на случай, если реплика пуста (FK evotor_products→stores).
  await db
    .insert(evotorStores)
    .values({ id: storeId, name: `Эвотор ${storeId}` })
    .onConflictDoNothing({ target: evotorStores.id });

  // Снимок «до»: цена/остаток АКТИВНЫХ товаров по uuid — для сравнения и как
  // знаменатель страховки архивации. Архивные в выгрузке отсутствуют законно,
  // поэтому в знаменатель порога полноты их включать нельзя (иначе со временем
  // архивация отключилась бы навсегда).
  const before = await db
    .select({
      evotorUuid: evotorProducts.evotorUuid,
      priceKopecks: evotorProducts.priceKopecks,
      quantity: evotorProducts.quantity,
    })
    .from(evotorProducts)
    .where(
      and(
        eq(evotorProducts.storeId, storeId),
        eq(evotorProducts.isArchived, false),
      ),
    );
  const current = new Map<string, ReplicaSnapshot>(
    before.map((r) => [
      r.evotorUuid,
      { priceKopecks: r.priceKopecks, quantity: r.quantity },
    ]),
  );
  const replicaBefore = before.length;

  let upserted = 0;
  let failed = 0;
  let isNew = 0;
  let priceChanged = 0;
  let qtyChanged = 0;

  for (const p of parsed) {
    const prev = current.get(p.uuid);
    try {
      const cls = classifyReconcile(prev, p);
      if (cls.isNew) isNew += 1;
      if (cls.priceChanged) priceChanged += 1;
      if (cls.qtyChanged) qtyChanged += 1;

      await db
        .insert(evotorProducts)
        .values({
          storeId,
          evotorUuid: p.uuid,
          name: p.name,
          priceKopecks: p.priceKopecks ?? 0,
          costPriceKopecks: p.costPriceKopecks,
          quantity: p.quantity !== null ? String(p.quantity) : '0',
          measure: p.measure ?? 'шт',
          groupUuid: p.groupUuid,
          groupName: p.groupName,
          barcodes: p.barcodes,
          article: p.article,
          code: p.code,
          evotorType: p.evotorType,
          isMarked: p.isMarked,
          allowToSell: p.allowToSell ?? true,
          isArchived: false, // присутствует в выгрузке — не архив
          matchKey: p.matchKey,
          raw: p.raw,
        })
        .onConflictDoUpdate({
          target: [evotorProducts.storeId, evotorProducts.evotorUuid],
          set: {
            name: p.name,
            costPriceKopecks: p.costPriceKopecks,
            measure: p.measure ?? 'шт',
            groupUuid: p.groupUuid,
            groupName: p.groupName,
            barcodes: p.barcodes,
            article: p.article,
            code: p.code,
            evotorType: p.evotorType,
            isMarked: p.isMarked,
            isArchived: false, // вернулся в выгрузку — снимаем архив
            matchKey: p.matchKey,
            raw: p.raw,
            // Цену/остаток/«В продаже» перезаписываем авторитетно, НО пустые
            // значения выгрузки не затирают текущее (дыра в отчёте ≠ изменение).
            ...(p.priceKopecks !== null && { priceKopecks: p.priceKopecks }),
            ...(p.quantity !== null && { quantity: String(p.quantity) }),
            ...(p.allowToSell !== null && { allowToSell: p.allowToSell }),
            syncedAt: sql`now()`,
            updatedAt: sql`now()`,
          },
        });
      upserted += 1;

      // ТЗ п.6: расхождение — поимённо в журнал (товар, старое→новое), не только
      // счётчик. prev существует, только если это не новый товар.
      if (prev && (cls.priceChanged || cls.qtyChanged)) {
        try {
          await db.insert(syncLog).values({
            direction: 'import',
            entity: 'reconciliation',
            storeId,
            evotorUuid: p.uuid,
            status: 'ok',
            payload: {
              drift: {
                ...(cls.priceChanged && {
                  priceBefore: prev.priceKopecks,
                  priceAfter: p.priceKopecks,
                }),
                ...(cls.qtyChanged && {
                  qtyBefore: prev.quantity,
                  qtyAfter: p.quantity,
                }),
              },
            },
          });
        } catch {
          // журнал сам не должен ронять сверку
        }
      }
    } catch (err) {
      failed += 1;
      try {
        await db.insert(syncLog).values({
          direction: 'import',
          entity: 'reconciliation',
          storeId,
          evotorUuid: p.uuid,
          status: 'error',
          error: (err as Error).message,
        });
      } catch {
        // журнал сам не должен ронять сверку
      }
    }
  }

  // Архивация ОТСУТСТВУЮЩИХ в выгрузке — по evotor_uuid (а не по метке времени:
  // товар, что ЕСТЬ в выгрузке, но чей upsert упал, архивировать нельзя — иначе
  // он ошибочно пропал бы с витрины). Страховка archivalIsSafe от неполного/
  // битого файла остаётся; пустой parsedUuids до сюда не доходит (страховка).
  let archived = 0;
  const archivalSkipped = !archivalIsSafe(parsed.length, replicaBefore);
  if (!archivalSkipped && parsedUuids.length > 0) {
    const r = await db
      .update(evotorProducts)
      .set({ isArchived: true, updatedAt: sql`now()` })
      .where(
        and(
          eq(evotorProducts.storeId, storeId),
          eq(evotorProducts.isArchived, false),
          notInArray(evotorProducts.evotorUuid, parsedUuids),
        ),
      )
      .returning({ uuid: evotorProducts.evotorUuid });
    archived = r.length;
  }

  const summary: ReconcileSummary = {
    storeId,
    rows: rows.length,
    imported: parsed.length,
    skipped,
    upserted,
    failed,
    isNew,
    priceChanged,
    qtyChanged,
    archived,
    archivalSkipped,
  };

  await db.insert(syncLog).values({
    direction: 'import',
    entity: 'reconciliation',
    storeId,
    status: failed || archivalSkipped ? 'error' : 'ok',
    payload: summary,
    error: archivalSkipped
      ? `архивация пропущена: в выгрузке ${parsed.length} товаров при реплике ${replicaBefore} — возможно неполный файл`
      : failed
        ? `не записано товаров: ${failed}`
        : null,
  });

  return summary;
}
