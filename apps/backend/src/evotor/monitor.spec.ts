import { describe, expect, it } from 'bun:test';
import { dueAlerts, evaluateHealth } from './monitor';

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

/**
 * Гашение повторов. Проверка здоровья идёт раз в час, и проблема, которая
 * держится сутками (например, выгрузку давно не обновляли), присылала один и
 * тот же текст каждый час — 8 одинаковых сообщений подряд в Telegram. Такой
 * поток перестают читать, и настоящая авария теряется среди повторов.
 *
 * Правило: один и тот же ключ повторяем не чаще, чем раз в cooldown. НОВАЯ
 * проблема уходит немедленно. Если проблема пропала и вернулась — тоже
 * немедленно: пропажа сбрасывает счётчик.
 */
describe('dueAlerts', () => {
  const H = 3_600_000;
  const A = { key: 'reconcile_stale', subject: 'Сверка', detail: 'д' };
  const B = { key: 'events_failed', subject: 'События', detail: 'д' };

  it('первое появление уходит сразу', () => {
    const r = dueAlerts([A], new Map(), 1000 * H, 12 * H);
    expect(r.send.map((a) => a.key)).toEqual(['reconcile_stale']);
    expect(r.sentAt.get('reconcile_stale')).toBe(1000 * H);
  });

  it('повтор в течение окна молчания подавляется', () => {
    const sent = new Map([['reconcile_stale', 1000 * H]]);
    const r = dueAlerts([A], sent, 1001 * H, 12 * H);
    expect(r.send).toEqual([]);
    expect(r.sentAt.get('reconcile_stale')).toBe(1000 * H); // метка не сдвинулась
  });

  it('после окна молчания напоминание уходит снова', () => {
    const sent = new Map([['reconcile_stale', 1000 * H]]);
    const r = dueAlerts([A], sent, 1013 * H, 12 * H);
    expect(r.send.map((a) => a.key)).toEqual(['reconcile_stale']);
    expect(r.sentAt.get('reconcile_stale')).toBe(1013 * H);
  });

  it('проблема пропала → метка забыта, возврат уведомит немедленно', () => {
    const sent = new Map([['reconcile_stale', 1000 * H]]);
    const gone = dueAlerts([], sent, 1001 * H, 12 * H);
    expect(gone.sentAt.has('reconcile_stale')).toBe(false);
    const back = dueAlerts([A], gone.sentAt, 1002 * H, 12 * H);
    expect(back.send.map((a) => a.key)).toEqual(['reconcile_stale']);
  });

  it('разные проблемы не глушат друг друга', () => {
    const sent = new Map([['reconcile_stale', 1000 * H]]);
    const r = dueAlerts([A, B], sent, 1001 * H, 12 * H);
    expect(r.send.map((a) => a.key)).toEqual(['events_failed']);
  });

  it('нулевое окно молчания — прежнее поведение, шлём каждый раз', () => {
    const sent = new Map([['reconcile_stale', 1000 * H]]);
    expect(dueAlerts([A], sent, 1000 * H, 0).send).toHaveLength(1);
  });
});

/**
 * Два РАЗНЫХ сигнала, которые раньше были склеены в один.
 *
 * «Сверка не запускалась» — авария: планировщик мёртв, процесс не крутится.
 * Ловится по времени последней ПОПЫТКИ, независимо от её исхода.
 *
 * «Снимок остатков устарел» — операционка: попытки идут, но применять нечего,
 * потому что выгрузку давно не обновляли. Ловится по времени последнего
 * УСПЕШНОГО применения, и порог тут другой — под недельный ритм, а не суточный.
 *
 * Раньше оба случая давали один и тот же текст с порогом 26 часов. После
 * перехода на «файл раз в неделю» это означало ежедневный ложный крик о том,
 * что сверка не проходит, хотя она исправно запускается и осознанно
 * пропускает протухший файл.
 */
describe('evaluateHealth: запуск сверки и свежесть снимка — разные сигналы', () => {
  const H = 3_600_000;
  const now = Date.UTC(2026, 7, 9, 12, 0);
  const T = { reconcileMaxAgeHours: 26, snapshotMaxAgeHours: 8 * 24 };
  const base = {
    reconcileEnabled: true,
    failedEventCount: 0,
    lastReconcileAt: new Date(now - 2 * H),
    lastSnapshotAt: new Date(now - 2 * H),
  };

  it('всё свежее — молчим', () => {
    expect(evaluateHealth(base, T, now)).toEqual([]);
  });

  it('попытки идут, снимку 3 дня — при недельном ритме это НОРМА, молчим', () => {
    const a = evaluateHealth(
      { ...base, lastSnapshotAt: new Date(now - 72 * H) },
      T,
      now,
    );
    expect(a).toEqual([]);
  });

  it('снимку больше недели — операционный сигнал, но НЕ авария', () => {
    const a = evaluateHealth(
      { ...base, lastSnapshotAt: new Date(now - 9 * 24 * H) },
      T,
      now,
    );
    expect(a.map((x) => x.key)).toEqual(['snapshot_stale']);
    expect(a[0].subject).toContain('выгрузк');
  });

  it('планировщик молчит сутки — авария, даже если снимок свежий', () => {
    const a = evaluateHealth(
      { ...base, lastReconcileAt: new Date(now - 30 * H) },
      T,
      now,
    );
    expect(a.map((x) => x.key)).toEqual(['reconcile_stale']);
  });

  it('и не запускалась, и снимок протух — оба сигнала, разными текстами', () => {
    const a = evaluateHealth(
      {
        ...base,
        lastReconcileAt: new Date(now - 30 * H),
        lastSnapshotAt: new Date(now - 9 * 24 * H),
      },
      T,
      now,
    );
    expect(a.map((x) => x.key).sort()).toEqual(['reconcile_stale', 'snapshot_stale']);
  });

  it('сверка выключена — ни того ни другого', () => {
    const a = evaluateHealth(
      { ...base, reconcileEnabled: false, lastReconcileAt: null, lastSnapshotAt: null },
      T,
      now,
    );
    expect(a).toEqual([]);
  });
});
