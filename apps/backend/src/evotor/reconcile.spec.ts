import { describe, expect, it } from 'bun:test';
import { classifyReconcile, exportIsFresh, msUntilDailyRun } from './reconcile';

/**
 * Страховка от УСТАРЕВШЕЙ выгрузки. Сверка авторитетна: она выравнивает
 * остатки «в пользу Эвотора». Если автодоставка сломается и в каталоге
 * останется вчерашний файл, сверка будет КАЖДУЮ НОЧЬ откатывать остатки,
 * насчитанные живыми чеками, к старому снимку — молча и со статусом «ok».
 * Поэтому протухший файл не применяем вовсе: пропуск + алерт лучше тихой
 * порчи остатков (fail-safe, как archivalIsSafe для неполного файла).
 */
describe('exportIsFresh', () => {
  const H = 3_600_000;
  const now = Date.UTC(2026, 6, 16, 3, 30); // ночной запуск сверки

  it('выгрузка этой ночи → свежая, применяем', () => {
    expect(exportIsFresh(now - 2 * H, now, 26)).toBe(true);
  });

  it('выгрузка позавчерашняя → протухла, НЕ применяем (иначе откатит остатки)', () => {
    expect(exportIsFresh(now - 48 * H, now, 26)).toBe(false);
  });

  it('ровно на границе порога → ещё свежая (суточный файл в 26ч окно влезает)', () => {
    expect(exportIsFresh(now - 26 * H, now, 26)).toBe(true);
  });

  it('порог 0 → проверка выключена, применяем любой файл (ручной прогон)', () => {
    expect(exportIsFresh(now - 1000 * H, now, 0)).toBe(true);
  });

  it('mtime в будущем (перекос часов) → не блокируем сверку', () => {
    expect(exportIsFresh(now + 5 * H, now, 26)).toBe(true);
  });
});

/**
 * Ночная сверка (ТЗ-5, Шаг 6): выгрузка авторитетна («в пользу Эвотора»).
 * classifyReconcile сравнивает строку выгрузки с текущей репликой и говорит,
 * что изменилось — для журнала расхождений. Пустые значения выгрузки НЕ
 * считаются расхождением (цену/остаток не затираем «дырой» в отчёте).
 */
describe('classifyReconcile', () => {
  it('товара нет в реплике → isNew, без «расхождений»', () => {
    const r = classifyReconcile(undefined, { priceKopecks: 12600, quantity: 6 });
    expect(r).toEqual({ isNew: true, priceChanged: false, qtyChanged: false });
  });

  it('цена и остаток совпали → нет расхождений', () => {
    const r = classifyReconcile(
      { priceKopecks: 12600, quantity: '6.000' },
      { priceKopecks: 12600, quantity: 6 },
    );
    expect(r).toEqual({ isNew: false, priceChanged: false, qtyChanged: false });
  });

  it('изменилась цена → priceChanged', () => {
    const r = classifyReconcile(
      { priceKopecks: 12600, quantity: '6.000' },
      { priceKopecks: 13000, quantity: 6 },
    );
    expect(r.priceChanged).toBe(true);
    expect(r.qtyChanged).toBe(false);
  });

  it('изменился остаток → qtyChanged', () => {
    const r = classifyReconcile(
      { priceKopecks: 12600, quantity: '6.000' },
      { priceKopecks: 12600, quantity: 4 },
    );
    expect(r.qtyChanged).toBe(true);
    expect(r.priceChanged).toBe(false);
  });

  it('дробный остаток сравнивается численно (6.000 == 6)', () => {
    const r = classifyReconcile(
      { priceKopecks: 12600, quantity: '6.000' },
      { priceKopecks: 12600, quantity: 6 },
    );
    expect(r.qtyChanged).toBe(false);
  });

  it('пустая цена в выгрузке (null) → не расхождение, не затираем', () => {
    const r = classifyReconcile(
      { priceKopecks: 12600, quantity: '6.000' },
      { priceKopecks: null, quantity: 6 },
    );
    expect(r.priceChanged).toBe(false);
  });

  it('пустой остаток в выгрузке (null) → не расхождение, не затираем', () => {
    const r = classifyReconcile(
      { priceKopecks: 12600, quantity: '6.000' },
      { priceKopecks: 12600, quantity: null },
    );
    expect(r.qtyChanged).toBe(false);
  });

  it('и цена, и остаток изменились → оба флага', () => {
    const r = classifyReconcile(
      { priceKopecks: 12600, quantity: '6.000' },
      { priceKopecks: 9900, quantity: 3 },
    );
    expect(r).toEqual({ isNew: false, priceChanged: true, qtyChanged: true });
  });
});

describe('msUntilDailyRun', () => {
  const H = 3_600_000;
  it('цель сегодня позже сейчас → ждём разницу', () => {
    const now = new Date(2026, 6, 13, 1, 0, 0); // локальные 01:00
    expect(msUntilDailyRun('03:30', now)).toBe(2.5 * H); // 2 ч 30 мин
  });

  it('цель уже прошла сегодня → переносим на завтра', () => {
    const now = new Date(2026, 6, 13, 4, 0, 0); // локальные 04:00
    expect(msUntilDailyRun('03:30', now)).toBe(23.5 * H);
  });

  it('цель ровно сейчас → на завтра (не 0, чтобы не крутить в цикле)', () => {
    const now = new Date(2026, 6, 13, 3, 30, 0);
    expect(msUntilDailyRun('03:30', now)).toBe(24 * H);
  });

  it('одноразрядный час «3:30» тоже понимается', () => {
    const now = new Date(2026, 6, 13, 1, 0, 0);
    expect(msUntilDailyRun('3:30', now)).toBe(2.5 * H);
  });
});
