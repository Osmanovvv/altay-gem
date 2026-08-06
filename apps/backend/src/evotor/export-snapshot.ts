/**
 * Время СНЯТИЯ выгрузки из товароучётки — из содержимого самого файла.
 *
 * Зачем. Сверка авторитетна по каждому товару, у которого нет более свежего
 * движения (см. stock_asof), и время файла решает, что он вправе перезаписать.
 * Раньше временем считался mtime, то есть момент появления файла на сервере.
 * Живой случай 05.08.2026: товароучётка сформировала выгрузку в 09:00:36, а
 * до нас она добралась в 15:31 — по mtime файл выглядел бы новее всех продаж
 * дня и откатил бы их.
 *
 * Откуда берём. xlsx — это zip, и в локальном заголовке каждой записи лежит
 * момент её создания (DOS-время, шаг 2 секунды, без указания зоны). У этой
 * товароучётки метка в UTC — проверено эмпирикой на живых данных: по 51
 * продаже того дня файл учитывал всё до 08:47:04 и не знал ничего с 09:24:43,
 * а метка 09:00:36 попала ровно в это окно.
 *
 * Зона у чужого сервера может смениться без нас, поэтому метке доверяем
 * только когда она физически возможна (см. resolveExportAt).
 */

const ZIP_LOCAL_HEADER = 0x04034b50;
/** Перекос часов, который прощаем: метка чуть «позже» файла — не сбой зоны. */
const CLOCK_SKEW_MS = 60_000;

/**
 * Самая ранняя осмысленная метка времени из локальных заголовков zip —
 * момент, когда файл начали формировать. null, если это не zip или меток нет.
 */
export function readSnapshotTime(buf: Buffer): number | null {
  let earliest: number | null = null;
  // Заголовок занимает 30 байт; дальше сигнатуры искать бессмысленно.
  for (let i = 0; i + 30 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== ZIP_LOCAL_HEADER) continue;
    const time = buf.readUInt16LE(i + 10);
    const date = buf.readUInt16LE(i + 12);
    const year = 1980 + ((date >> 9) & 0x7f);
    const month = (date >> 5) & 0x0f;
    const day = date & 0x1f;
    const hour = (time >> 11) & 0x1f;
    const minute = (time >> 5) & 0x3f;
    const second = (time & 0x1f) * 2;
    // Нулевая дата и «эпоха DOS» — заглушки архиватора, не время файла.
    if (year < 2000 || year > 2100) continue;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (hour > 23 || minute > 59 || second > 59) continue;
    const ms = Date.UTC(year, month - 1, day, hour, minute, second);
    if (earliest === null || ms < earliest) earliest = ms;
  }
  return earliest;
}

/** Каким временем считать снимок и почему. */
export type ExportAt =
  | { atMs: number; source: 'snapshot' | 'mtime' }
  | { atMs: null; source: 'rejected'; reason: string };

/**
 * Метке доверяем, если она не в будущем и не позже момента, когда файл
 * оказался у нас (файл не может быть сформирован после того, как записан).
 * Нарушение любого из условий означает сбитую зону или часы на стороне
 * товароучётки: такая метка «новее продаж» и откатила бы их, поэтому файл
 * не применяем вовсе — лучше пропуск с алертом, чем тихая порча остатков.
 * Метки нет — работаем по-старому, по времени файла.
 */
export function resolveExportAt(input: {
  snapshotMs: number | null;
  mtimeMs: number;
  nowMs: number;
}): ExportAt {
  const { snapshotMs, mtimeMs, nowMs } = input;
  if (snapshotMs === null) return { atMs: mtimeMs, source: 'mtime' };
  if (snapshotMs > nowMs + CLOCK_SKEW_MS) {
    return {
      atMs: null,
      source: 'rejected',
      reason: `время снимка в будущем (${new Date(snapshotMs).toISOString()}) — часы или часовой пояс товароучётки сбиты`,
    };
  }
  if (snapshotMs > mtimeMs + CLOCK_SKEW_MS) {
    return {
      atMs: null,
      source: 'rejected',
      reason: `время снимка (${new Date(snapshotMs).toISOString()}) позже появления файла на сервере (${new Date(mtimeMs).toISOString()}) — часовой пояс товароучётки сбит`,
    };
  }
  return { atMs: snapshotMs, source: 'snapshot' };
}
