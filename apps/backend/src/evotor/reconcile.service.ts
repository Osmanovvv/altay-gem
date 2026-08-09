import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import { open, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import * as XLSX from 'xlsx';
import { DB, type Database } from '../db/database.module';
import { syncLog, webhookEvents } from '../db/schema';
import { TelegramService } from '../notifications/telegram.service';
import { cloudProductToRow, cloudSnapshotAt } from './cloud-goods';
import { EvotorApiService } from './evotor-api.service';
import {
  readMaxUpdatedAt,
  readSnapshotTime,
  resolveExportAt,
} from './export-snapshot';
import { dueAlerts, evaluateHealth } from './monitor';
import { UUID_FORM } from './parse';
import { reconcileFileName } from './reconcile-upload';
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
  private readonly cloudStock: boolean;
  private readonly alertCooldownHours: number;
  private readonly snapshotMaxAgeHours: number;
  private readonly cloudLagMinutes: number;
  /** Когда последний раз слали алерт по ключу — против копий каждый час. */
  private alertSentAt: Map<string, number> = new Map();
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
    private readonly api: EvotorApiService,
  ) {
    // Источник суточного снимка: облако Эвотора (нужны права на номенклатуру
    // и остатки) или файл выгрузки из товароучётки. Пока права не выданы —
    // остаётся файл, поэтому по умолчанию выключено.
    this.cloudStock = config.get<string>('EVOTOR_CLOUD_STOCK', '') === '1';
    // Запас на отставание облака от продаж (проверено живьём 09.08: у части
    // товаров облако показывало остаток ДО только что прошедшей продажи).
    // На эту величину снимок «стареет», и свежие чеки остаются за собой.
    this.cloudLagMinutes = config.get<number>('EVOTOR_CLOUD_LAG_MINUTES') ?? 60;
    // Окно молчания для повторов одного и того же алерта (0 — слать всегда).
    this.alertCooldownHours =
      config.get<number>('EVOTOR_ALERT_COOLDOWN_HOURS') ?? 12;
    // «Пора обновить выгрузку»: порог задаётся ритмом обновления снимка.
    // Ритм недельный (остатки продающихся товаров ведут чеки), поэтому
    // 8 суток = неделя с запасом. При переходе на облако снимок станет
    // ежедневным, и порог имеет смысл снизить до 26 ч.
    this.snapshotMaxAgeHours =
      config.get<number>('EVOTOR_SNAPSHOT_MAX_AGE_HOURS') ?? 8 * 24;
    this.dir = config.get<string>('EVOTOR_RECONCILE_DIR', '') || '';
    this.at = config.get<string>('EVOTOR_RECONCILE_AT', '') || '03:30';
    this.healthMinutes = config.get<number>('EVOTOR_HEALTH_MINUTES') ?? 60;
    this.reconcileMaxAgeHours =
      config.get<number>('EVOTOR_RECONCILE_MAX_AGE_HOURS') ?? 26;
    // Возраст САМОГО ФАЙЛА выгрузки (не путать с reconcileMaxAgeHours — тот
    // про давность последнего ПРОГОНА сверки). 0 — проверку не делать.
    this.maxFileAgeHours =
      config.get<number>('EVOTOR_RECONCILE_MAX_FILE_AGE_HOURS') ?? 48;
    this.failedEventMinutes =
      config.get<number>('EVOTOR_FAILED_EVENT_MINUTES') ?? 15;
    // Включён ли поллинг документов — для мониторинга его здоровья (ТЗ п.9).
    this.pollEnabled = (config.get<number>('EVOTOR_POLL_MINUTES') ?? 30) > 0;
  }

  /** Есть ли вообще суточный снимок: из облака или из файла. */
  get reconcileEnabled(): boolean {
    return this.cloudStock || this.dir !== '';
  }

  onModuleInit(): void {
    if (this.reconcileEnabled) {
      this.scheduleNextReconcile();
      this.log.log(
        this.cloudStock
          ? `Ночная сверка включена: ${this.at}, источник — ОБЛАКО Эвотора`
          : `Ночная сверка включена: ${this.at}, каталог выгрузок ${this.dir}`,
      );
    } else {
      this.log.log(
        'Ночная сверка выключена (нет ни EVOTOR_CLOUD_STOCK, ни EVOTOR_RECONCILE_DIR) — работают чеки и поллинг',
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
      // Облако (когда права выданы) — единственный источник, без человека.
      // Иначе прежний путь: файл выгрузки из каталога.
      (this.cloudStock ? this.runCloudSync() : this.runReconcile())
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
    await this.markRun('file');
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
        // Один дескриптор на stat+чтение: между двумя обращениями к пути
        // загрузка из админки может подменить файл (rename), и мы получили бы
        // mtime старого с содержимым нового — метка «позже файла», ложный отказ.
        const fh = await open(path, 'r');
        let meta: Awaited<ReturnType<typeof fh.stat>>;
        let buf: Buffer;
        try {
          [meta, buf] = await Promise.all([fh.stat(), fh.readFile()]);
        } finally {
          await fh.close();
        }
        // Момент СНЯТИЯ выгрузки берём из самого файла, а не из mtime: между
        // выгрузкой из товароучётки и её появлением у нас бывают часы (живой
        // случай: снята в 09:00, доставлена в 15:31). По этому времени сверка
        // решает, какие остатки вправе перезаписать — mtime дал бы «файл
        // новее сегодняшних продаж» и откатил бы их (см. export-snapshot).
        const rows = this.readRows(buf);
        const at = resolveExportAt({
          snapshotMs: readSnapshotTime(buf),
          mtimeMs: meta.mtimeMs,
          nowMs: Date.now(),
          // Нижняя граница из самих данных — ловит метку, прочитанную в
          // неверном (западнее реального) часовом поясе.
          minPlausibleMs: readMaxUpdatedAt(rows),
        });
        if (at.source === 'rejected') {
          const msg = `выгрузка ${file} НЕ применена: ${at.reason}`;
          this.log.warn(`сверка: ${msg}`);
          await this.telegram.alert('Ночная сверка: неверное время выгрузки', msg);
          continue;
        }
        // Диагностику пишем ДО применения: если reconcileStore упадёт на
        // середине, разбираться придётся именно по этой строке.
        this.log.log(
          `сверка ${storeId}: снимок ${new Date(at.atMs).toISOString()} ` +
            `(источник — ${at.source === 'snapshot' ? 'метка внутри файла' : 'нижняя граница по данным файла'})`,
        );
        if (at.source === 'data') {
          this.log.warn(`сверка ${file}: ${at.warn}`);
          await this.telegram.alert(
            'Сверка: у выгрузки нет метки времени',
            `${file}: ${at.warn}`,
          );
        }
        // Протухший файл НЕ применяем: сверка авторитетна и откатила бы
        // остатки, насчитанные за день живыми чеками, к старому снимку —
        // молча и со статусом «ok». Пропуск + алерт (см. exportIsFresh).
        if (!exportIsFresh(at.atMs, Date.now(), this.maxFileAgeHours)) {
          const ageH = Math.floor((Date.now() - at.atMs) / 3_600_000);
          const msg =
            `выгрузка ${file} устарела (снята ${new Date(at.atMs).toISOString()}, ` +
            `${ageH} ч назад, порог ${this.maxFileAgeHours} ч) — НЕ применена, ` +
            `чтобы не откатить остатки, насчитанные чеками. ` +
            `Проверьте доставку выгрузки в ${this.dir}.`;
          this.log.warn(`сверка: ${msg}`);
          await this.telegram.alert('Ночная сверка: выгрузка устарела', msg);
          continue;
        }
        const s = await reconcileStore(this.db, storeId, rows, at.atMs);
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

  /**
   * Сверка ПРЯМО ИЗ ОБЛАКА Эвотора — без файла выгрузки и без человека.
   *
   * Требует у приложения прав «Получать номенклатуру из облака Эвотор» и
   * «Получить остатки номенклатуры из Облака Эвотор» (кабинет разработчика,
   * вкладка «Интеграция»). Права вшиты в токен установки, поэтому после их
   * включения приложение нужно переустановить в кабинете клиента — иначе
   * ответ так и останется 403.
   *
   * Момент снимка — время НАЧАЛА чтения: пока страницы дочитываются, на кассе
   * могут пройти продажи, и более поздняя метка позволила бы затереть их.
   * Дальше всё идёт по той же дороге, что и файл: те же колонки, тот же
   * парсер, та же охрана остатка по каждому товару, та же страховка от
   * неполного источника.
   */
  async runCloudSync(): Promise<ReconcileSummary[]> {
    await this.markRun('cloud');
    if (!(await this.api.hasAccess())) {
      this.log.warn('Сверка из облака: нет токена Эвотора — пропуск');
      return [];
    }
    let stores: Array<{ id: string }>;
    try {
      stores = await this.api.listStores();
    } catch (err) {
      const msg = `список магазинов недоступен: ${(err as Error).message}`;
      this.log.error(`сверка из облака: ${msg}`);
      await this.telegram.alert('Сверка из облака не выполнена', msg);
      return [];
    }

    const summaries: ReconcileSummary[] = [];
    for (const store of stores) {
      // Снимок помечаем НАЧАЛОМ чтения минус запас на отставание облака:
      // проверено живьём, что данные о продаже доезжают до облака не мгновенно,
      // и метка «сейчас» перезаписала бы свежий чек остатком до продажи.
      const atMs = cloudSnapshotAt(Date.now(), this.cloudLagMinutes);
      let products;
      try {
        products = await this.api.listProducts(store.id);
      } catch (err) {
        const msg = (err as Error).message;
        // 403 — прав на номенклатуру нет; 402 — приложение не на всех кассах
        // магазина. Это состояния настройки, а не сбой: сообщаем понятно.
        const human = msg.includes('403')
          ? 'нет права на чтение номенклатуры — включите опции в кабинете разработчика и переустановите приложение у клиента'
          : msg.includes('402')
            ? 'приложение установлено не на всех кассах магазина'
            : msg;
        this.log.warn(`сверка из облака, магазин ${store.id}: ${human}`);
        await this.telegram.alert(
          'Сверка из облака: магазин пропущен',
          `${store.id}: ${human}`,
        );
        continue;
      }

      try {
        const rows = products.map((p) => cloudProductToRow(p));
        const s = await reconcileStore(this.db, store.id, rows, atMs);
        summaries.push(s);
        this.log.log(
          `сверка из облака ${store.id}: прочитано ${products.length}, записано ${s.upserted}, ` +
            `цена ${s.priceChanged}, остаток ${s.qtyChanged}, новых ${s.isNew}, архив ${s.archived}`,
        );
        if (s.failed || s.archivalSkipped) {
          await this.telegram.alert(
            'Сверка из облака прошла с замечаниями',
            `Магазин ${store.id}: ошибок ${s.failed}` +
              (s.archivalSkipped
                ? `; архивация пропущена (прочитано ${s.imported} товаров — возможно неполный ответ)`
                : ''),
          );
        }
      } catch (err) {
        const msg = `магазин ${store.id}: ${(err as Error).message}`;
        this.log.error(`сверка из облака: ${msg}`);
        await this.telegram.alert('Сверка из облака: ошибка магазина', msg);
      }
    }
    return summaries;
  }

  /**
   * Отметка о ЗАПУСКЕ сверки — пишется в начале прогона, независимо от того,
   * нашлось ли что применять. По ней мониторинг отличает «планировщик мёртв»
   * от «снимок давно не обновляли»: раньше оба случая выглядели одинаково,
   * и после перехода на недельный ритм выгрузки алерт «сверка не проходила»
   * кричал бы каждый день при исправно работающей системе.
   */
  private async markRun(source: 'file' | 'cloud'): Promise<void> {
    await this.db
      .insert(syncLog)
      .values({
        direction: 'import',
        entity: 'reconcile_run',
        status: 'ok',
        payload: { source },
      })
      .catch(() => undefined); // журнал не должен ронять прогон
  }

  /** Оценить здоровье интеграции и разослать алерты по проблемам. */
  async checkHealth(): Promise<void> {
    // «Устарела» = сверка не ЗАПУСКАЛАСЬ вообще (ok ИЛИ error). Качество прогона
    // (ошибки строк) сигналит отдельный алерт из runReconcile — не путаем это с
    // «сверка не проходила» (иначе одна битая строка = ложный «не запускалась»).
    // ЗАПУСК сверки: отметка пишется в начале каждого прогона, даже если
    // применять оказалось нечего. Отсутствие отметок = планировщик мёртв.
    const [run] = await this.db
      .select({ ts: sql<Date | null>`max(${syncLog.createdAt})` })
      .from(syncLog)
      .where(eq(syncLog.entity, 'reconcile_run'));
    // ПРИМЕНЁННЫЙ снимок: успешная сверка хотя бы одного магазина.
    const [snap] = await this.db
      .select({ ts: sql<Date | null>`max(${syncLog.createdAt})` })
      .from(syncLog)
      .where(and(eq(syncLog.entity, 'reconciliation'), eq(syncLog.status, 'ok')));
    // До появления отметок о запуске (старые данные) считаем запуском
    // последнюю сверку — иначе после выкатки прилетел бы ложный алерт.
    const [rec] = run?.ts
      ? [run]
      : await this.db
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
        lastSnapshotAt: snap?.ts ? new Date(snap.ts) : null,
        failedEventCount: Number(fail?.n ?? 0),
        pollEnabled: this.pollEnabled,
        pollLastStatus,
        unparsedRecentCount: Number(unparsed?.n ?? 0),
      },
      {
        reconcileMaxAgeHours: this.reconcileMaxAgeHours,
        snapshotMaxAgeHours: this.snapshotMaxAgeHours,
      },
      Date.now(),
    );
    // Один и тот же алерт не повторяем чаще окна молчания: проверка идёт раз
    // в час, и держащаяся сутками проблема иначе засыпает Telegram копиями,
    // среди которых теряется настоящая авария (см. dueAlerts).
    const { send, sentAt } = dueAlerts(
      alerts,
      this.alertSentAt,
      Date.now(),
      this.alertCooldownHours * 3_600_000,
    );
    this.alertSentAt = sentAt;
    for (const a of send) {
      this.log.warn(`health-алерт [${a.key}]: ${a.subject}`);
      await this.telegram.alert(a.subject, a.detail);
    }
    // Продолжающиеся, но погашенные проблемы всё равно видны в логе.
    for (const a of alerts) {
      if (!send.includes(a))
        this.log.warn(`health-алерт [${a.key}] продолжается (повтор погашен)`);
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

  /**
   * Приём свежей выгрузки магазина из админки (без scp на сервер).
   * Пишем атомарно: сначала во временный файл, затем rename — иначе ночная
   * сверка может подхватить наполовину записанный файл и «увидеть» неполный
   * каталог (а неполный каталог = массовая архивация товаров).
   */
  async saveExport(storeId: string, data: Buffer): Promise<{
    file: string;
    bytes: number;
    savedAt: Date;
    /** Момент снятия выгрузки из товароучётки (из содержимого файла). */
    snapshotAt: Date;
    /** Возраст снимка в часах на момент загрузки. */
    ageHours: number;
    willApply: boolean;
    warn: string;
  }> {
    if (!this.dir) {
      throw new Error(
        'каталог выгрузок не настроен (EVOTOR_RECONCILE_DIR) — загрузка недоступна',
      );
    }
    // Время снятия достаём ДО записи: негодный файл не должен затирать
    // лежащую в каталоге рабочую выгрузку.
    const now = Date.now();
    const at = resolveExportAt({
      snapshotMs: readSnapshotTime(data),
      mtimeMs: now, // файл появляется у нас сейчас
      nowMs: now,
      minPlausibleMs: readMaxUpdatedAt(this.readRows(data)),
    });
    if (at.source === 'rejected') {
      throw new Error(`файл не принят: ${at.reason}`);
    }
    // at.atMs здесь всегда есть: ветка 'rejected' отсеяна выше.
    const snapshotMs = at.atMs;
    // Свежесть считаем на момент БЛИЖАЙШЕЙ сверки, а не загрузки: файл
    // возрастом «почти порог» к ночному прогону протухнет, и сообщить об
    // этом надо сейчас, пока человек ещё у экрана.
    const willRunAt = now + msUntilDailyRun(this.at, new Date(now));
    if (!exportIsFresh(snapshotMs, willRunAt, this.maxFileAgeHours)) {
      const ageAtRun = Math.floor((willRunAt - snapshotMs) / 3_600_000);
      throw new Error(
        `выгрузка снята ${new Date(snapshotMs).toISOString()} — к ближайшей сверке ей будет ${ageAtRun} ч ` +
          `при пороге ${this.maxFileAgeHours} ч, она не применится. Файл НЕ сохранён, ` +
          `чтобы не затереть текущую выгрузку. Скачайте свежую и загрузите её.`,
      );
    }

    const file = reconcileFileName(storeId);
    const target = join(this.dir, file);
    const tmp = `${target}.part-${now}`;
    await writeFile(tmp, data);
    await rename(tmp, target);
    this.log.log(
      `выгрузка принята: ${file} (${data.length} байт), снимок ` +
        `${new Date(snapshotMs).toISOString()} (источник — ${at.source})`,
    );
    return {
      file,
      bytes: data.length,
      savedAt: new Date(now),
      snapshotAt: new Date(snapshotMs),
      ageHours: Math.round(((now - snapshotMs) / 3_600_000) * 10) / 10,
      willApply: true, // негодные файлы сюда не доходят — отсеяны выше
      /** Пустая строка — метка была; иначе объяснение, почему точность ниже. */
      warn: at.source === 'data' ? at.warn : '',
    };
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

  /** Строки первого листа. Читаем из уже прочитанного буфера — файл
   *  открывается один раз (из него же берётся метка времени снимка). */
  private readRows(buf: Buffer): Record<string, unknown>[] {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
  }
}
