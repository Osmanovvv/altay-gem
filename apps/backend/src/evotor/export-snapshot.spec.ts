import { describe, expect, it } from 'bun:test';
import {
  readMaxUpdatedAt,
  readSnapshotTime,
  resolveExportAt,
  type ExportAt,
} from './export-snapshot';

/**
 * Время СНЯТИЯ выгрузки, а не её появления у нас на диске.
 *
 * Живой случай 05.08.2026: товароучётка сформировала файл в 09:00:36 UTC,
 * а до сервера он добрался в 15:31 — разрыв 6,5 часов. Сверка авторитетна
 * по каждому товару, у которого нет более свежего движения, поэтому взять
 * время загрузки значило бы «файл новее сегодняшних продаж» и откатить
 * полдня торговли.
 */

/** Минимальный zip с записями и заданными DOS-временами. */
function zipWith(
  dates: Array<{ y: number; mo: number; d: number; h: number; mi: number; s: number }>,
  opts: { method?: number; version?: number; prefix?: string } = {},
): Buffer {
  const parts = dates.map((t) => {
    const b = Buffer.alloc(30);
    b.writeUInt32LE(0x04034b50, 0); // сигнатура локального заголовка
    b.writeUInt16LE(opts.version ?? 20, 4); // версия для распаковки
    b.writeUInt16LE(opts.method ?? 8, 8); // deflate
    b.writeUInt16LE((t.h << 11) | (t.mi << 5) | Math.floor(t.s / 2), 10);
    b.writeUInt16LE(((t.y - 1980) << 9) | (t.mo << 5) | t.d, 12);
    return b;
  });
  return Buffer.concat([Buffer.from(opts.prefix ?? 'PREFIX'), ...parts]);
}

describe('readSnapshotTime', () => {
  it('живой случай: 05.08.2026 09:00:36 UTC достаётся из заголовка zip', () => {
    const buf = zipWith([{ y: 2026, mo: 8, d: 5, h: 9, mi: 0, s: 36 }]);
    expect(readSnapshotTime(buf)).toBe(Date.parse('2026-08-05T09:00:36Z'));
  });

  it('несколько записей → берём САМУЮ РАННЮЮ (начало формирования файла)', () => {
    const buf = zipWith([
      { y: 2026, mo: 8, d: 5, h: 9, mi: 1, s: 30 },
      { y: 2026, mo: 8, d: 5, h: 9, mi: 0, s: 36 },
      { y: 2026, mo: 8, d: 5, h: 9, mi: 2, s: 0 },
    ]);
    expect(readSnapshotTime(buf)).toBe(Date.parse('2026-08-05T09:00:36Z'));
  });

  it('нет zip-записей (не xlsx / битый файл) → null', () => {
    expect(readSnapshotTime(Buffer.from('это просто текст'))).toBeNull();
  });

  it('мусорная дата в заголовке (нулевая или до 2000 года) игнорируется', () => {
    const buf = zipWith([
      { y: 1980, mo: 1, d: 1, h: 0, mi: 0, s: 0 },
      { y: 2026, mo: 8, d: 5, h: 9, mi: 0, s: 36 },
    ]);
    expect(readSnapshotTime(buf)).toBe(Date.parse('2026-08-05T09:00:36Z'));
  });

  it('случайная сигнатура в сжатых данных отсеивается по методу сжатия', () => {
    // Сигнатура может встретиться в deflate-потоке; настоящий заголовок несёт
    // метод 0 или 8. Мусорный метод 0x9999 не должен дать «самую раннюю» метку.
    const fake = zipWith([{ y: 2001, mo: 1, d: 1, h: 0, mi: 0, s: 0 }], { method: 0x9999 });
    const real = zipWith([{ y: 2026, mo: 8, d: 5, h: 9, mi: 0, s: 36 }]);
    expect(readSnapshotTime(Buffer.concat([fake, real]))).toBe(
      Date.parse('2026-08-05T09:00:36Z'),
    );
  });

  it('заголовок, обрезанный ПОСЕРЕДИНЕ, не роняет разбор и не даёт метки', () => {
    // Важно резать так, чтобы обрезанный заголовок реально попал в диапазон
    // сканирования, иначе тест ничего не проверяет.
    const buf = zipWith([{ y: 2026, mo: 8, d: 5, h: 9, mi: 0, s: 36 }]);
    const cut = buf.subarray(0, buf.length - 18); // заголовок начат, но не дописан
    expect(cut.length).toBeGreaterThan(4);
    expect(() => readSnapshotTime(cut)).not.toThrow();
    expect(readSnapshotTime(cut)).toBeNull();
  });
});

/**
 * Нижняя граница из данных: снимок не может быть раньше последнего изменения,
 * которое в него попало. Колонка подписана зоной явно, поэтому не зависит от
 * настроек сервера товароучётки.
 */
describe('readMaxUpdatedAt', () => {
  const K = 'Обновлен (МСК, +3)';

  it('берёт максимум и переводит из МСК в UTC', () => {
    expect(
      readMaxUpdatedAt([
        { [K]: '2026-08-05 08:46:44' },
        { [K]: '2026-07-29 09:56:35' },
        { [K]: '2026-08-05 08:00:00' },
      ]),
    ).toBe(Date.parse('2026-08-05T05:46:44Z'));
  });

  it('пустые и мусорные значения пропускаются, не роняя разбор', () => {
    expect(
      readMaxUpdatedAt([{ [K]: null }, { [K]: 'н/д' }, { [K]: '2026-08-05 08:46:44' }]),
    ).toBe(Date.parse('2026-08-05T05:46:44Z'));
  });

  it('нет колонки или строк → null (проверка просто не применяется)', () => {
    expect(readMaxUpdatedAt([{ Наименование: 'Мёд' }])).toBeNull();
    expect(readMaxUpdatedAt([])).toBeNull();
  });
});

/** Хелпер: сузить union, чтобы тест видел reason (и проходил typecheck). */
function rejected(r: ExportAt): { reason: string } {
  if (r.source !== 'rejected') throw new Error(`ожидался отказ, получено ${r.source}`);
  return r;
}

describe('resolveExportAt', () => {
  const SNAP = Date.parse('2026-08-05T09:00:36Z');
  const MTIME = Date.parse('2026-08-05T15:31:35Z'); // когда файл лёг на диск
  const NOW = Date.parse('2026-08-05T16:00:00Z');

  it('нормальный случай: берём метку снимка, а не время файла', () => {
    expect(resolveExportAt({ snapshotMs: SNAP, mtimeMs: MTIME, nowMs: NOW })).toEqual({
      atMs: SNAP,
      source: 'snapshot',
    });
  });

  it('метки нет → откат на время файла, но с предупреждением (молча нельзя)', () => {
    const r = resolveExportAt({ snapshotMs: null, mtimeMs: MTIME, nowMs: NOW });
    expect(r.source).toBe('mtime');
    expect(r.atMs).toBe(MTIME);
    if (r.source === 'mtime') expect(r.warn).toContain('нет метки');
  });

  it('метка ПОЗЖЕ появления файла у нас — невозможно, отвергаем файл', () => {
    // +10 минут: позже файла, но ещё НЕ в будущем относительно nowMs, иначе
    // сработала бы другая проверка и тест ничего бы не доказал.
    const r = resolveExportAt({
      snapshotMs: MTIME + 10 * 60_000,
      mtimeMs: MTIME,
      nowMs: NOW,
    });
    expect(rejected(r).reason).toContain('позже его появления');
  });

  it('метка в будущем относительно нас — тоже отвергаем', () => {
    const r = resolveExportAt({
      snapshotMs: NOW + 3_600_000,
      mtimeMs: NOW + 3_600_000,
      nowMs: NOW,
    });
    expect(rejected(r).reason).toContain('в будущем');
  });

  it('файл пересохранён на машине UTC+7 — метка «из будущего», отказ с понятной причиной', () => {
    // Реальный риск: Excel/архиватор/Проводник перезаписывают заголовки
    // локальным временем, а магазины в Новосибирске.
    const r = resolveExportAt({
      snapshotMs: NOW + 7 * 3_600_000,
      mtimeMs: NOW,
      nowMs: NOW,
    });
    expect(rejected(r).reason).toContain('пересохранён');
  });

  it('метка РАНЬШЕ последнего изменения в данных — зона прочитана западнее, отказ', () => {
    const r = resolveExportAt({
      snapshotMs: SNAP,
      mtimeMs: MTIME,
      nowMs: NOW,
      minPlausibleMs: SNAP + 30 * 60_000,
    });
    expect(rejected(r).reason).toContain('раньше последнего изменения');
  });

  it('нижняя граница соблюдена → метка принимается', () => {
    expect(
      resolveExportAt({
        snapshotMs: SNAP,
        mtimeMs: MTIME,
        nowMs: NOW,
        minPlausibleMs: SNAP - 3 * 3_600_000, // живой разрыв: 3–7 часов
      }),
    ).toEqual({ atMs: SNAP, source: 'snapshot' });
  });

  it('небольшой перекос часов (до минуты) — не повод отвергать', () => {
    expect(
      resolveExportAt({ snapshotMs: MTIME + 30_000, mtimeMs: MTIME, nowMs: NOW }),
    ).toEqual({ atMs: MTIME + 30_000, source: 'snapshot' });
  });

  it('метка старее файла на месяцы — принимаем: это просто старая выгрузка, её отсеет порог свежести', () => {
    const old = Date.parse('2026-06-01T09:00:00Z');
    expect(resolveExportAt({ snapshotMs: old, mtimeMs: MTIME, nowMs: NOW })).toEqual({
      atMs: old,
      source: 'snapshot',
    });
  });
});
