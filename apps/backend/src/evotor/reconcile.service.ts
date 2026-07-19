import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import * as XLSX from 'xlsx';
import { DB, type Database } from '../db/database.module';
import { syncLog, webhookEvents } from '../db/schema';
import { TelegramService } from '../notifications/telegram.service';
import { evaluateHealth } from './monitor';
import { UUID_FORM } from './parse';
import {
  exportIsFresh,
  msUntilDailyRun,
  reconcileStore,
  type ReconcileSummary,
} from './reconcile';

/**
 * Ночная сверка + мониторинг интеграции с Эвотором (этап 2, ТЗ-5/п.9, Путь B).
 *
 * Сверка: раз в сутки читает файлы выгрузки `<storeId>.xlsx` из каталога
 * EVOTOR_RECONCILE_DIR и приводит реплику к ним (reconcileStore — «в пользу
 * Эвотора»). Автодоставка выгрузки в этот каталог — операционка (подписка на
 * отчёт по почте). ТОЛЬКО НАША БД, к Эвотору не ходим.
 *
 * Мониторинг: периодически оценивает здоровье интеграции (несостоявшаяся
 * сверка, зависшие вебхуки) и шлёт алерты исполнителю в Telegram. Журнал
 * операций (sync_log/webhook_events, хранение ≥90 дней) ведёт EvotorService.
 *
 * Планировщик — суточный setTimeout без внешних зависимостей (стиль проекта).
 */
@Injectable()
export class ReconcileService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ReconcileService.name);
  private readonly dir: string;
  private readonly at: string;
  private readonly healthMinutes: number;
  private readonly reconcileMaxAgeHours: number;
  private readonly maxFileAgeHours: number;
  private readonly failedEventMinutes: number;
  private readonly pollEnabled: boolean;
  private reconcileTimer?: ReturnType<typeof setTimeout>;
  private healthTimer?: ReturnType<typeof setInterval>;

  constructor(
    config: ConfigService,
    @Inject(DB) private readonly db: Database,
    private readonly telegram: TelegramService,
  ) {
    this.dir = config.get<string>('EVOTOR_RECONCILE_DIR', '') || '';
    this.at = config.get<string>('EVOTOR_RECONCILE_AT', '') || '03:30';
    this.healthMinutes = config.get<number>('EVOTOR_HEALTH_MINUTES') ?? 60;
    this.reconcileMaxAgeHours =
      config.get<number>('EVOTOR_RECONCILE_MAX_AGE_HOURS') ?? 26;
    // Возраст САМОГО ФАЙЛА выгрузки (не путать с reconcileMaxAgeHours — тот
    // про давность последнего ПРОГОНА сверки). 0 — проверку не делать.
    this.maxFileAgeHours =
      config.get<number>('EVOTOR_RECONCILE_MAX_FILE_AGE_HOURS') ?? 26;
    this.failedEventMinutes =
      config.get<number>('EVOTOR_FAILED_EVENT_MINUTES') ?? 15;
    // Включён ли поллинг документов — для мониторинга его здоровья (ТЗ п.9).
    this.pollEnabled = (config.get<number>('EVOTOR_POLL_MINUTES') ?? 30) > 0;
  }

  get reconcileEnabled(): boolean {
    return this.dir !== '';
  }

  onModuleInit(): void {
    if (this.reconcileEnabled) {
      this.scheduleNextReconcile();
      this.log.log(
        `Ночная сверка включена: ${this.at}, каталог выгрузок ${this.dir}`,
      );
    } else {
      this.log.log(
        'Ночная сверка выключена (EVOTOR_RECONCILE_DIR не задан) — работают чеки и поллинг',
      );
    }
    if (this.healthMinutes > 0) {
      const tick = () =>
        this.checkHealth().catch((err: Error) =>
          this.log.error(`health-проверка: ${err.message}`),
        );
      this.healthTimer = setInterval(tick, this.healthMinutes * 60_000);
      this.healthTimer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
  }

  private scheduleNextReconcile(): void {
    const delay = msUntilDailyRun(this.at, new Date());
    this.reconcileTimer = setTimeout(() => {
      this.runReconcile()
        .catch((err: Error) => this.log.error(`ночная сверка: ${err.message}`))
        .finally(() => this.scheduleNextReconcile()); // перепланируем на завтра
    }, delay);
    this.reconcileTimer.unref?.();
  }

  /**
   * Свести реплику к суточным выгрузкам из каталога. Каждый файл `<storeId>.xlsx`
   * применяется к своему магазину. Сбой файла/страховка архивации → алерт
   * исполнителю. Возвращает сводки (для ручного запуска/статуса).
   */
  async runReconcile(): Promise<ReconcileSummary[]> {
    if (!this.reconcileEnabled) return [];
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch (err) {
      const msg = `каталог выгрузок недоступен: ${this.dir} (${(err as Error).message})`;
      this.log.error(msg);
      await this.telegram.alert('Ночная сверка: нет доступа к выгрузкам', msg);
      return [];
    }

    const files = entries.filter(
      (f) => extname(f).toLowerCase() === '.xlsx',
    );
    const summaries: ReconcileSummary[] = [];
    let handled = 0;
    for (const file of files) {
      const storeId = basename(file, extname(file));
      if (!UUID_FORM.test(storeId)) {
        this.log.warn(
          `сверка: файл ${file} пропущен — имя не UUID магазина (ожидается <storeId>.xlsx)`,
        );
        continue;
      }
      handled += 1;
      try {
        const path = join(this.dir, file);
        // Протухший файл НЕ применяем: сверка авторитетна и откатила бы
        // остатки, насчитанные за день живыми чеками, к старому снимку —
        // молча и со статусом «ok». Пропуск + алерт (см. exportIsFresh).
        const { mtimeMs } = await stat(path);
        if (!exportIsFresh(mtimeMs, Date.now(), this.maxFileAgeHours)) {
          const ageH = Math.floor((Date.now() - mtimeMs) / 3_600_000);
          const msg =
            `выгрузка ${file} устарела (${ageH} ч, порог ${this.maxFileAgeHours} ч) — ` +
            `НЕ применена, чтобы не откатить остатки, насчитанные чеками. ` +
            `Проверьте автодоставку выгрузки в ${this.dir}.`;
          this.log.warn(`сверка: ${msg}`);
          await this.telegram.alert('Ночная сверка: выгрузка устарела', msg);
          continue;
        }
        const rows = this.readRows(path);
        const s = await reconcileStore(this.db, storeId, rows);
        summaries.push(s);
        this.log.log(
          `сверка ${storeId}: записано ${s.upserted}, цена ${s.priceChanged}, остаток ${s.qtyChanged}, новых ${s.isNew}, архив ${s.archived}`,
        );
        if (s.failed || s.archivalSkipped) {
          await this.telegram.alert(
            'Ночная сверка прошла с замечаниями',
            `Магазин ${storeId}: ошибок ${s.failed}` +
              (s.archivalSkipped
                ? `; архивация пропущена (в выгрузке ${s.imported} товаров — возможно неполный файл)`
                : ''),
          );
        }
      } catch (err) {
        const msg = `магазин ${storeId}, файл ${file}: ${(err as Error).message}`;
        this.log.error(`сверка: ${msg}`);
        await this.telegram.alert('Ночная сверка: ошибка магазина', msg);
      }
    }
    if (this.reconcileEnabled && handled === 0) {
      const msg = `в каталоге ${this.dir} нет файлов вида <storeId>.xlsx`;
      this.log.warn(`сверка: ${msg}`);
      await this.telegram.alert('Ночная сверка: нет выгрузок', msg);
    }
    return summaries;
  }

  /** Оценить здоровье интеграции и разослать алерты по проблемам. */
  async checkHealth(): Promise<void> {
    // «Устарела» = сверка не ЗАПУСКАЛАСЬ вообще (ok ИЛИ error). Качество прогона
    // (ошибки строк) сигналит отдельный алерт из runReconcile — не путаем это с
    // «сверка не проходила» (иначе одна битая строка = ложный «не запускалась»).
    const [rec] = await this.db
      .select({ ts: sql<Date | null>`max(${syncLog.createdAt})` })
      .from(syncLog)
      .where(eq(syncLog.entity, 'reconciliation'));
    // Зависшие события меряем по firstReceivedAt: received_at сбрасывается на
    // now() при КАЖДОЙ повторной доставке (claimEvent оживляет 'failed'), иначе
    // непроходящий сбой никогда не «старел» бы и алерт молчал.
    const [fail] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.source, 'evotor'),
          eq(webhookEvents.status, 'failed'),
          sql`${webhookEvents.firstReceivedAt} < now() - make_interval(mins => ${this.failedEventMinutes})`,
        ),
      );
    const pollLastStatus = await this.lastPollStatus();
    // unparsed за СУТКИ по firstReceivedAt — старый разовый пинг проверки URL
    // (вечно 'received') в окно не попадает и фон не шумит.
    const [unparsed] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.source, 'evotor'),
          eq(webhookEvents.type, 'unparsed'),
          sql`${webhookEvents.firstReceivedAt} > now() - interval '24 hours'`,
        ),
      );

    const alerts = evaluateHealth(
      {
        reconcileEnabled: this.reconcileEnabled,
        lastReconcileAt: rec?.ts ? new Date(rec.ts) : null,
        failedEventCount: Number(fail?.n ?? 0),
        pollEnabled: this.pollEnabled,
        pollLastStatus,
        unparsedRecentCount: Number(unparsed?.n ?? 0),
      },
      { reconcileMaxAgeHours: this.reconcileMaxAgeHours },
      Date.now(),
    );
    for (const a of alerts) {
      this.log.warn(`health-алерт [${a.key}]: ${a.subject}`);
      await this.telegram.alert(a.subject, a.detail);
    }
  }

  /** Статус последнего АКТИВНОГО прогона поллинга ('ok'|'error'|null — не было). */
  private async lastPollStatus(): Promise<'ok' | 'error' | null> {
    const [row] = await this.db
      .select({ status: syncLog.status })
      .from(syncLog)
      .where(eq(syncLog.entity, 'poll'))
      .orderBy(desc(syncLog.createdAt))
      .limit(1);
    return row?.status ?? null;
  }

  /** Снимок состояния интеграции для админ-мониторинга (GET /admin/evotor/status). */
  async status(): Promise<{
    reconcile: {
      enabled: boolean;
      at: string;
      dir: string | null;
      lastOkAt: Date | null;
      lastSummary: ReconcileSummary | null;
    };
    events: { failedRecent: number; lastProcessedAt: Date | null };
    poll: {
      enabled: boolean;
      lastStatus: 'ok' | 'error' | null;
      lastAt: Date | null;
    };
  }> {
    const [lastRec] = await this.db
      .select({ createdAt: syncLog.createdAt, payload: syncLog.payload })
      .from(syncLog)
      .where(eq(syncLog.entity, 'reconciliation'))
      .orderBy(desc(syncLog.createdAt))
      .limit(1);
    const [lastOk] = await this.db
      .select({ ts: sql<Date | null>`max(${syncLog.createdAt})` })
      .from(syncLog)
      .where(and(eq(syncLog.entity, 'reconciliation'), eq(syncLog.status, 'ok')));
    const [fail] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.source, 'evotor'),
          eq(webhookEvents.status, 'failed'),
          sql`${webhookEvents.firstReceivedAt} < now() - make_interval(mins => ${this.failedEventMinutes})`,
        ),
      );
    const [proc] = await this.db
      .select({ ts: sql<Date | null>`max(${webhookEvents.processedAt})` })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.source, 'evotor'),
          eq(webhookEvents.status, 'processed'),
        ),
      );
    const [poll] = await this.db
      .select({ status: syncLog.status, createdAt: syncLog.createdAt })
      .from(syncLog)
      .where(eq(syncLog.entity, 'poll'))
      .orderBy(desc(syncLog.createdAt))
      .limit(1);

    return {
      reconcile: {
        enabled: this.reconcileEnabled,
        at: this.at,
        dir: this.dir || null,
        lastOkAt: lastOk?.ts ? new Date(lastOk.ts) : null,
        lastSummary:
          (lastRec?.payload as ReconcileSummary | undefined) ?? null,
      },
      events: {
        failedRecent: Number(fail?.n ?? 0),
        lastProcessedAt: proc?.ts ? new Date(proc.ts) : null,
      },
      poll: {
        enabled: this.pollEnabled,
        lastStatus: poll?.status ?? null,
        lastAt: poll?.createdAt ?? null,
      },
    };
  }

  private readRows(file: string): Record<string, unknown>[] {
    const wb = XLSX.readFile(file);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
  }
}
