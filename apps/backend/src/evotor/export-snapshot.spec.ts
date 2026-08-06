import { describe, expect, it } from 'bun:test';
import { readSnapshotTime, resolveExportAt } from './export-snapshot';

/**
 * Время СНЯТИЯ выгрузки, а не её появления у нас на диске.
 *
 * Живой случай 05.08.2026: товароучётка сформировала файл в 09:00:36 UTC,
 * а до сервера он добрался в 15:31 — разрыв 6,5 часов. Сверка авторитетна
 * по каждому товару, у которого нет более свежего движения, поэтому взять
 * время загрузки значило бы «файл новее сегодняшних продаж» и откатить
 * полдня торговли.
 *
 * Время лежит внутри самого xlsx: это zip, и в локальных заголовках записей
 * стоит момент формирования. Проверено эмпирикой: по 51 продаже того дня
 * файл учитывал всё до 08:47:04 и не знал ничего с 09:24:43 — метка 09:00:36
 * попала ровно в окно, то есть товароучётка пишет её в UTC.
 */

/** Минимальный zip с одной записью и заданным DOS-временем. */
function zipWith(dates: Array<{ y: number; mo: number; d: number; h: number; mi: number; s: number }>): Buffer {
  const parts = dates.map((t) => {
    const b = Buffer.alloc(30);
    b.writeUInt32LE(0x04034b50, 0); // сигнатура локального заголовка
    b.writeUInt16LE((t.h << 11) | (t.mi << 5) | Math.floor(t.s / 2), 10);
    b.writeUInt16LE(((t.y - 1980) << 9) | (t.mo << 5) | t.d, 12);
    return b;
  });
  return Buffer.concat([Buffer.from('мусор до'), ...parts]);
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

  it('обрезанный хвост файла не роняет разбор', () => {
    const full = zipWith([{ y: 2026, mo: 8, d: 5, h: 9, mi: 0, s: 36 }]);
    expect(() => readSnapshotTime(full.subarray(0, full.length - 5))).not.toThrow();
  });
});

/**
 * Решение «каким временем считать снимок» с защитой от кривой метки.
 * Метка внутри zip — местное время ЧУЖОГО сервера без указания зоны. У этой
 * товароучётки это UTC (проверено), но сменить настройки могут без нас.
 * Поэтому доверяем метке, только если она физически возможна.
 */
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

  it('метки нет (не смогли разобрать) → откат на время файла', () => {
    expect(resolveExportAt({ snapshotMs: null, mtimeMs: MTIME, nowMs: NOW })).toEqual({
      atMs: MTIME,
      source: 'mtime',
    });
  });

  it('метка ПОЗЖЕ появления файла у нас — невозможно, отвергаем файл', () => {
    // Признак сбитой зоны/часов на стороне товароучётки. Такая метка
    // «новее продаж» и откатила бы их — применять нельзя вовсе.
    // Берём +10 минут: позже файла, но ещё НЕ в будущем относительно nowMs,
    // иначе сработала бы другая проверка и тест ничего бы не доказал.
    const r = resolveExportAt({
      snapshotMs: MTIME + 10 * 60_000,
      mtimeMs: MTIME,
      nowMs: NOW,
    });
    expect(r.source).toBe('rejected');
    expect(r.reason).toContain('позже');
  });

  it('метка в будущем относительно нас — тоже отвергаем', () => {
    const r = resolveExportAt({
      snapshotMs: NOW + 3_600_000,
      mtimeMs: NOW + 3_600_000,
      nowMs: NOW,
    });
    expect(r.source).toBe('rejected');
    expect(r.reason).toContain('будущ');
  });

  it('небольшой перекос часов (до минуты) — не повод отвергать', () => {
    const r = resolveExportAt({
      snapshotMs: MTIME + 30_000,
      mtimeMs: MTIME,
      nowMs: NOW,
    });
    expect(r).toEqual({ atMs: MTIME + 30_000, source: 'snapshot' });
  });

  it('метка старее файла на месяцы — принимаем: это просто старая выгрузка, её отсеет порог свежести', () => {
    const old = Date.parse('2026-06-01T09:00:00Z');
    expect(resolveExportAt({ snapshotMs: old, mtimeMs: MTIME, nowMs: NOW })).toEqual({
      atMs: old,
      source: 'snapshot',
    });
  });
});
