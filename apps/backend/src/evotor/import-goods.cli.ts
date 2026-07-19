/**
 * CLI первичного импорта / ручной сверки каталога из Excel-выгрузки Эвотора
 * (этап 2, ТЗ-1/ТЗ-5, Путь B). ФАЙЛ → НАША БД — к Эвотору не обращается.
 *
 * Запуск:
 *   bun run src/evotor/import-goods.cli.ts <файл.xlsx> <storeId> [имя] [адрес]
 *
 * storeId — UUID магазина Эвотора (реплика ведётся по магазину). Выгрузка
 * относится к одному магазину; для второго магазина — второй запуск со
 * своим файлом и storeId. Ядро (upsert/архивация/детект расхождений) общее
 * с ночной сверкой — reconcileStore(); повторный запуск идемпотентен и
 * работает как сверка «в пользу Эвотора».
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import * as schema from '../db/schema';
import { evotorStores } from '../db/schema';
import { UUID_FORM } from './parse';
import { reconcileStore } from './reconcile';

function readRows(file: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw: типы сохраняются (числа/булевы), defval: пустые ячейки → null.
  return XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
}

async function main(): Promise<void> {
  const [file, storeId, storeName, storeAddress] = process.argv.slice(2);
  if (!file || !storeId) {
    throw new Error(
      'использование: import-goods.cli.ts <файл.xlsx> <storeId> [имя] [адрес]',
    );
  }
  if (!UUID_FORM.test(storeId)) {
    throw new Error(`storeId не похож на UUID Эвотора: ${storeId}`);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан');

  const rows = readRows(file);
  console.log(`[import] файл: ${file}\n[import] строк в выгрузке: ${rows.length}`);

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });
  try {
    // Имя/адрес магазина задаёт первичный импорт (в сверке — не трогаем).
    await db
      .insert(evotorStores)
      .values({
        id: storeId,
        name: storeName ?? `Магазин ${storeId.slice(0, 8)}`,
        address: storeAddress ?? null,
      })
      .onConflictDoUpdate({
        target: evotorStores.id,
        set: {
          ...(storeName && { name: storeName }),
          ...(storeAddress && { address: storeAddress }),
        },
      });

    const s = await reconcileStore(db, storeId, rows);
    console.log(
      `[import] товаров к записи: ${s.imported}, пропущено (группы/мусор): ${s.skipped}\n` +
        `[import] записано: ${s.upserted}, ошибок: ${s.failed}\n` +
        `[import] новых: ${s.isNew}, цена выправлена: ${s.priceChanged}, остаток выправлен: ${s.qtyChanged}`,
    );
    if (s.archivalSkipped) {
      console.warn(
        `[import] АРХИВАЦИЯ ПРОПУЩЕНА (страховка): в выгрузке ${s.imported} товаров — возможно неполный/битый файл`,
      );
    } else if (s.archived) {
      console.log(`[import] архивировано отсутствующих в выгрузке: ${s.archived}`);
    }
    console.log(`[import] готово по магазину ${storeId}`);
    if (s.failed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[import] ошибка:', err instanceof Error ? err.message : err);
  process.exit(1);
});
