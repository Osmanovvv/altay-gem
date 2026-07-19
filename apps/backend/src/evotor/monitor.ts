/**
 * Оценка здоровья интеграции с Эвотором (этап 2, ТЗ р.10.3 п.9).
 *
 * Чистая функция: по снимку состояния (последняя успешная сверка, число
 * зависших событий) решает, какие алерты слать исполнителю. Сам сбор снимка
 * и отправка — в ReconcileService (там БД и Telegram).
 */

/** Снимок состояния интеграции для оценки. */
export interface HealthSnapshot {
  /** Настроена ли ночная сверка (есть каталог выгрузок). */
  reconcileEnabled: boolean;
  /** Время последнего ЗАПУСКА ночной сверки (ok или error; null — ни одного). */
  lastReconcileAt: Date | null;
  /** Кол-во событий Эвотора, зависших в 'failed' дольше порога. */
  failedEventCount: number;
  /** Включён ли страховочный поллинг документов (EVOTOR_POLL_MINUTES>0). */
  pollEnabled?: boolean;
  /** Статус последнего активного прогона поллинга (null — ещё не прогонялся). */
  pollLastStatus?: 'ok' | 'error' | null;
  /** Сколько unparsed-событий ПОЯВИЛОСЬ за последние сутки (не всего). */
  unparsedRecentCount?: number;
}

/**
 * Порог unparsed-событий за сутки. 1–2 — легитимный шум (пинг проверки URL
 * при перенастройке вебхука в кабинете); настоящая смена формата даёт десятки
 * в день (каждый чек). Порог 3 отделяет одно от другого.
 */
const UNPARSED_ALERT_MIN = 3;

export interface HealthThresholds {
  /** Сверка старше стольких часов считается несостоявшейся. */
  reconcileMaxAgeHours: number;
}

/** Готовый к отправке алерт. key — стабильный идентификатор проблемы. */
export interface HealthAlert {
  key: string;
  subject: string;
  detail: string;
}

/** Список алертов по снимку. Пустой — всё в норме. */
export function evaluateHealth(
  s: HealthSnapshot,
  t: HealthThresholds,
  nowMs: number,
): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  // (1) Ночная сверка не проходила дольше порога — только если она включена
  //     (без каталога выгрузок сверка не работает — устаревание не сигнал).
  if (s.reconcileEnabled) {
    const ageMs = s.lastReconcileAt
      ? nowMs - s.lastReconcileAt.getTime()
      : Infinity;
    if (ageMs > t.reconcileMaxAgeHours * 3_600_000) {
      alerts.push({
        key: 'reconcile_stale',
        subject: 'Ночная сверка с Эвотором не проходила',
        detail: s.lastReconcileAt
          ? `Последняя успешная сверка: ${s.lastReconcileAt.toISOString()} (> ${t.reconcileMaxAgeHours} ч назад). Проверьте доставку выгрузки и логи.`
          : `Ни одной успешной сверки. Проверьте каталог выгрузок и логи.`,
      });
    }
  }

  // (2) События Эвотора зависли в 'failed' — признак недоставки/непроходящей
  //     обработки вебхуков (Эвотор ретраит только до 200; см. EvotorService).
  if (s.failedEventCount > 0) {
    alerts.push({
      key: 'events_failed',
      subject: 'Не обработаны события Эвотора',
      detail: `${s.failedEventCount} событий висят в статусе «ошибка». Возможна недоставка/сбой обработки вебхуков — проверьте журнал webhook_events.`,
    });
  }

  // (3) Страховочный поллинг документов сбоит — сама страховка от недоставки
  //     вебхуков не работает (ТЗ п.9). Алертим, только если поллинг включён И
  //     реально пытался прогоняться (был токен): pollLastStatus==='error'.
  //     Отсутствие прогонов (null, нет токена) шумом в dev не считаем.
  if (s.pollEnabled && s.pollLastStatus === 'error') {
    alerts.push({
      key: 'poll_unhealthy',
      subject: 'Страховочный поллинг документов сбоит',
      detail:
        'Последний прогон поллинга Cloud API завершился ошибкой (недоступность api.evotor.ru или протухший токен). Внутрисуточная страховка от недоставки вебхуков не работает — проверьте доступ к Эвотору.',
    });
  }

  // (4) Растут unparsed-события — вероятно, Эвотор сменил формат payload:
  //     чеки перестают разбираться МОЛЧА (ни failed, ни ретраев — мы отвечаем
  //     200), остатки замирают до суточной сверки. Ровно так конверт
  //     «Чеки ver.2» однажды тихо сломал списание — это ранний сигнал.
  if ((s.unparsedRecentCount ?? 0) >= UNPARSED_ALERT_MIN) {
    alerts.push({
      key: 'unparsed_growth',
      subject: 'События Эвотора перестали разбираться',
      detail: `За последние сутки ${s.unparsedRecentCount} событий сохранены как unparsed — возможно, Эвотор изменил формат payload. Чеки могут не применяться к остаткам (двигает только суточная сверка). Проверьте payload в webhook_events (type='unparsed').`,
    });
  }

  return alerts;
}
