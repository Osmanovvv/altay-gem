import { describe, expect, it } from 'bun:test';
import { evaluateHealth } from './monitor';

/**
 * Мониторинг интеграции (ТЗ р.10.3 п.9): по снимку состояния решаем, какие
 * алерты слать исполнителю. Два сигнала: (1) ночная сверка не проходила
 * дольше порога — сбой/не запустилась; (2) события Эвотора зависли в failed —
 * признак недоставки/непроходящей обработки.
 */
const T = { reconcileMaxAgeHours: 26 };
const NOW = Date.parse('2026-07-13T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

describe('evaluateHealth', () => {
  it('всё в норме → нет алертов', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(3), failedEventCount: 0 },
      T,
      NOW,
    );
    expect(a).toEqual([]);
  });

  it('сверка включена, но не проходила дольше порога → алерт', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(30), failedEventCount: 0 },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).toContain('reconcile_stale');
  });

  it('сверка включена, но не было ни одной успешной → алерт', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: null, failedEventCount: 0 },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).toContain('reconcile_stale');
  });

  it('сверка ВЫКЛючена → о её устаревании не алертим', () => {
    const a = evaluateHealth(
      { reconcileEnabled: false, lastReconcileAt: null, failedEventCount: 0 },
      T,
      NOW,
    );
    expect(a).toEqual([]);
  });

  it('свежая сверка (в пределах порога) → без алерта', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(25), failedEventCount: 0 },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).not.toContain('reconcile_stale');
  });

  it('зависшие события в failed → алерт с их числом', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(1), failedEventCount: 4 },
      T,
      NOW,
    );
    const ev = a.find((x) => x.key === 'events_failed');
    expect(ev).toBeDefined();
    expect(ev!.detail).toContain('4');
  });

  it('нет зависших событий → нет алерта о них', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(1), failedEventCount: 0 },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).not.toContain('events_failed');
  });

  it('несколько проблем сразу → несколько алертов', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: null, failedEventCount: 2 },
      T,
      NOW,
    );
    expect(a.map((x) => x.key).sort()).toEqual(['events_failed', 'reconcile_stale']);
  });

  // Здоровье страховочного поллинга (ТЗ п.9: признаки недоставки вебхуков).
  // Тихая смена формата Эвотором: чеки перестают разбираться и молча копятся
  // как unparsed/received — ни failed, ни алертов, остатки замирают до суточной
  // сверки. Ровно так «Чеки ver.2» (конверт ReceiptCreated) однажды сломали
  // списание. Рост unparsed за сутки — единственный ранний сигнал.
  it('unparsed-события растут (формат сломался?) → алерт unparsed_growth', () => {
    const a = evaluateHealth(
      {
        reconcileEnabled: true,
        lastReconcileAt: hoursAgo(3),
        failedEventCount: 0,
        unparsedRecentCount: 7,
      },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).toContain('unparsed_growth');
    expect(a.find((x) => x.key === 'unparsed_growth')!.detail).toContain('7');
  });

  it('единичный unparsed (пинг проверки URL) → НЕ алертим', () => {
    const a = evaluateHealth(
      {
        reconcileEnabled: true,
        lastReconcileAt: hoursAgo(3),
        failedEventCount: 0,
        unparsedRecentCount: 2,
      },
      T,
      NOW,
    );
    expect(a).toEqual([]);
  });

  it('unparsedRecentCount не передан (старый вызов) → совместимо, без алерта', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(3), failedEventCount: 0 },
      T,
      NOW,
    );
    expect(a).toEqual([]);
  });

  it('поллинг включён и последний прогон с ошибкой → алерт poll_unhealthy', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(1), failedEventCount: 0, pollEnabled: true, pollLastStatus: 'error' },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).toContain('poll_unhealthy');
  });

  it('поллинг включён и последний прогон ok → без алерта', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(1), failedEventCount: 0, pollEnabled: true, pollLastStatus: 'ok' },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).not.toContain('poll_unhealthy');
  });

  it('поллинг ещё ни разу не прогонялся (нет токена) → не алертим (нет шума в dev)', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(1), failedEventCount: 0, pollEnabled: true, pollLastStatus: null },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).not.toContain('poll_unhealthy');
  });

  it('поллинг выключен → о нём не алертим', () => {
    const a = evaluateHealth(
      { reconcileEnabled: true, lastReconcileAt: hoursAgo(1), failedEventCount: 0, pollEnabled: false, pollLastStatus: 'error' },
      T,
      NOW,
    );
    expect(a.map((x) => x.key)).not.toContain('poll_unhealthy');
  });
});
