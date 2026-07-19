import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { CacheService } from '../cache/cache.service';
import { DB, type Database } from '../db/database.module';
import {
  evotorInstallations,
  evotorProducts,
  evotorStores,
  syncLog,
  webhookEvents,
} from '../db/schema';
import { EvotorApiService } from './evotor-api.service';
import {
  buildMatchKey,
  documentStockSign,
  parseProductPush,
  parseReceipt,
  pushAuthorized,
} from './parse';

/** Результат claim-а события: наше / дубликат / занято параллельной доставкой. */
type Claim =
  | { kind: 'claimed'; claimedAt: string; firstReceivedAt: string }
  | { kind: 'duplicate' }
  | { kind: 'busy' };

/**
 * Обработка входящих уведомлений Эвотора (этап 2, ТЗ р.10).
 *
 * Модель надёжности (Эвотор ретраит ТОЛЬКО пока не получил 200):
 * - claim-based дедупликация через webhook_events (уникальный source+event_id):
 *   повторная доставка оживляет события в 'failed' и брошенные в 'received'
 *   (краш) старше 5 минут; свежий 'received' (параллельная доставка) → 503,
 *   'processed' → дубликат, 200 без работы.
 * - Ошибка обработки: событие помечается 'failed' и ошибка ПРОБРАСЫВАЕТСЯ
 *   (не-200) — Эвотор передоставит, claim оживит и переобработает.
 * - Чек применяется одной транзакцией с fenced-финализацией (processed
 *   ставится только владельцем claim-а) — двойного списания не бывает даже
 *   при зависшей >5 минут транзакции, перехваченной повторной доставкой.
 * - Исключение — события 'unparsed' (непонятное тело): фиксируются и 200,
 *   ретрай не исправит формат; остаются видимыми для разбора.
 */
@Injectable()
export class EvotorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EvotorService.name);
  private readonly webhookToken: string;
  private sweeper?: ReturnType<typeof setInterval>;
  private poller?: ReturnType<typeof setInterval>;
  private readonly pollMinutes: number;
  private readonly pollLookbackH: number;
  /** Типы документов, дочитываемые страховочным поллингом (движения товара). */
  private readonly pollTypes = ['SELL', 'PAYBACK', 'ACCEPT', 'WRITE_OFF', 'RETURN'];

  constructor(
    config: ConfigService,
    @Inject(DB) private readonly db: Database,
    private readonly cache: CacheService,
    private readonly api: EvotorApiService,
  ) {
    this.webhookToken = config.get<string>('EVOTOR_WEBHOOK_TOKEN', '');
    this.pollMinutes = config.get<number>('EVOTOR_POLL_MINUTES') ?? 30;
    this.pollLookbackH = config.get<number>('EVOTOR_POLL_LOOKBACK_HOURS') ?? 26;
  }

  /**
   * Проверка, что push пришёл от Эвотора: Authorization равен токену,
   * заданному в кабинете (вкладка «Интеграция»). Не настроен — отклоняем всё.
   */
  verifyPush(authHeader: string | undefined): void {
    if (!this.webhookToken) {
      this.log.error(
        'EVOTOR_WEBHOOK_TOKEN не задан — входящие уведомления отклоняются',
      );
      throw new UnauthorizedException();
    }
    if (!pushAuthorized(authHeader, this.webhookToken)) {
      this.log.warn('Отклонён push с неверным Authorization');
      throw new UnauthorizedException();
    }
  }

  /**
   * Вариант для пушей номенклатуры: кабинет говорит, что их Эвотор
   * авторизует ТОКЕНОМ ПОЛЬЗОВАТЕЛЯ (per-installation), а не токеном из
   * настройки — принимаем и его (сверка с активными установками в БД).
   */
  async verifyPushAllowUserToken(authHeader: string | undefined): Promise<void> {
    if (!this.webhookToken) {
      this.log.error(
        'EVOTOR_WEBHOOK_TOKEN не задан — входящие уведомления отклоняются',
      );
      throw new UnauthorizedException();
    }
    if (pushAuthorized(authHeader, this.webhookToken)) return;
    const raw = authHeader?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (raw) {
      const [row] = await this.db
        .select({ userId: evotorInstallations.userId })
        .from(evotorInstallations)
        .where(
          and(
            eq(evotorInstallations.token, raw),
            eq(evotorInstallations.active, true),
          ),
        );
      if (row) return;
    }
    this.log.warn('Отклонён push с неверным Authorization (номенклатура)');
    throw new UnauthorizedException();
  }

  /**
   * Установка приложения: Эвотор доставил per-installation токен.
   * Идемпотентно (upsert по userId). Удалённую установку токен сам по себе
   * НЕ воскрешает (доставка может быть запоздавшим ретраем) — активацию
   * делает guarded-событие ApplicationInstalled; новая строка — активна.
   */
  async saveUserToken(userId: string, token: string): Promise<void> {
    await this.db
      .insert(evotorInstallations)
      .values({ userId, token, active: true })
      .onConflictDoUpdate({
        target: evotorInstallations.userId,
        set: {
          token,
          active: sql`case when ${evotorInstallations.uninstalledAt} is null then true else ${evotorInstallations.active} end`,
          updatedAt: sql`now()`,
        },
      });
    this.log.log(`Токен Эвотора сохранён для пользователя ${userId}`);
  }

  /**
   * Жизненный цикл: ApplicationInstalled / ApplicationUninstalled.
   * Guard по БИЗНЕС-времени события (lastEventAt): запоздавший ретрай
   * (до 72 ч) не перебивает более свежее применённое событие. Сравнение
   * с updated_at не годится — его «грязнит» доставка токена.
   */
  async handleInstallationEvent(body: unknown): Promise<void> {
    const evt = (body ?? {}) as {
      id?: string;
      timestamp?: number;
      type?: string;
      data?: { userId?: string; productId?: string };
    };
    const eventId = `install:${evt.id ?? this.hashOf(body)}`;
    const claim = await this.claimEvent(eventId, evt.type ?? 'unknown', body);
    if (claim.kind === 'duplicate') return;
    if (claim.kind === 'busy') {
      throw new ServiceUnavailableException(
        'Событие уже обрабатывается — повторите доставку',
      );
    }

    const userId = evt.data?.userId;
    const eventTime =
      typeof evt.timestamp === 'number' && evt.timestamp > 0
        ? new Date(evt.timestamp)
        : null;
    // Применяем, только если строка не видела события новее этого.
    const freshOnly = (uid: string) =>
      eventTime
        ? and(
            eq(evotorInstallations.userId, uid),
            or(
              isNull(evotorInstallations.lastEventAt),
              lt(evotorInstallations.lastEventAt, eventTime),
            ),
          )
        : eq(evotorInstallations.userId, uid);

    try {
      if (evt.type === 'ApplicationUninstalled' && userId) {
        const updated = await this.db
          .update(evotorInstallations)
          .set({
            active: false,
            uninstalledAt: eventTime ?? sql`now()`,
            ...(eventTime && { lastEventAt: eventTime }),
            updatedAt: sql`now()`,
          })
          .where(freshOnly(userId))
          .returning({ userId: evotorInstallations.userId });

        if (updated.length) {
          this.log.warn(
            `Приложение удалено из ЛК Эвотора: ${userId} — синк остановлен`,
          );
        } else {
          const [row] = await this.db
            .select({ userId: evotorInstallations.userId })
            .from(evotorInstallations)
            .where(eq(evotorInstallations.userId, userId));
          if (!row) {
            // Удаление обогнало доставку токена: строки ещё нет. Отдаём
            // не-200 — Эвотор ретраит (до 72 ч), пока токен не создаст строку.
            throw new Error(
              `удаление до доставки токена (${userId}) — ждём ретрая`,
            );
          }
          this.log.log(
            `Запоздавший ретрай удаления ${userId} отброшен guard-ом`,
          );
        }
      } else if (evt.type === 'ApplicationInstalled' && userId) {
        const updated = await this.db
          .update(evotorInstallations)
          .set({
            active: true,
            uninstalledAt: null,
            ...(eventTime && { lastEventAt: eventTime }),
            updatedAt: sql`now()`,
          })
          .where(freshOnly(userId))
          .returning({ userId: evotorInstallations.userId });
        // Строки ещё нет — не страшно: её создаст доставка токена (активной).
        this.log.log(
          updated.length
            ? `Приложение установлено в ЛК Эвотора: ${userId}`
            : `Событие установки ${userId}: строки нет или ретрай устарел — пропуск`,
        );
      }
      await this.markEvent(eventId, 'processed');
    } catch (err) {
      this.log.error(`Событие установки: ${(err as Error).message}`);
      await this.markEvent(eventId, 'failed', (err as Error).message).catch(
        () => undefined,
      );
      throw err; // не-200 → Эвотор передоставит → claim оживит 'failed'
    }
  }

  /**
   * Чек с кассы (ТЗ-2): SELL — минус остаток магазина, PAYBACK — плюс.
   * Количество в чеке всегда положительное — направление задаёт type.
   */
  async handleReceipt(body: unknown): Promise<void> {
    // Push может нести и МАССИВ чеков — обрабатываем поэлементно
    // (у каждого чека свой uuid и свой дедуп; один уровень вложенности).
    if (Array.isArray(body)) {
      for (const one of body) {
        if (one && typeof one === 'object' && !Array.isArray(one))
          await this.handleReceipt(one);
      }
      return;
    }
    const doc = parseReceipt(body);
    if (!doc) {
      // Не похоже на документ — фиксируем для разбора и 200 (ретрай не поможет).
      await this.claimEvent(`doc:${this.hashOf(body)}`, 'unparsed', body);
      this.log.warn('PUT чека: тело не распознано, сохранено для разбора');
      return;
    }
    const eventId = `doc:${doc.uuid}`;
    const claim = await this.claimEvent(eventId, doc.type, body);
    if (claim.kind === 'duplicate') return;
    if (claim.kind === 'busy') {
      throw new ServiceUnavailableException(
        'Чек уже обрабатывается — повторите доставку',
      );
    }

    // Дельта-типы движения товара (количество положительное, знак задаёт ТИП):
    // SELL/WRITE_OFF/RETURN → −, PAYBACK/ACCEPT → +. INVENTORY (абсолютный
    // пересчёт) и REVALUATION (цена) дельтой НЕ применяем — их закрывает
    // суточная сверка; BUY/BUYBACK/CORRECTION и прочее → 0 (не трогаем остаток).
    const sign = documentStockSign(doc.type);
    // Движение С ТОВАРОМ, но без разобранного storeUuid: НЕ финализируем как
    // 'processed' — иначе claimEvent увидит его как 'duplicate' и страховочный
    // поллинг (он подставляет storeUuid из пути) уже не переприменит. Помечаем
    // 'failed' и отвечаем 200 (ретрай Эвотора тем же безмагазинным телом
    // бесполезен): поллинг переприменит документ с магазином, а монитор увидит
    // проблему. Достижимо только если storeUuid не нашёлся вообще нигде.
    if (sign !== 0 && doc.positions.length > 0 && !doc.storeId) {
      this.log.warn(
        `Документ ${doc.type} ${doc.uuid} без storeUuid — остаток не изменён, ждём поллинг/сверку`,
      );
      await this.markEvent(eventId, 'failed', 'документ без storeUuid — не применён');
      return;
    }
    if (sign === 0 || doc.positions.length === 0 || !doc.storeId) {
      await this.markEvent(eventId, 'processed');
      if (doc.type === 'INVENTORY' || doc.type === 'REVALUATION')
        this.log.log(
          `Документ ${doc.type} ${doc.uuid} получен — применит суточная сверка (не дельта)`,
        );
      return;
    }

    // Канонический порядок захвата блокировок строк — два одновременных чека
    // с общими товарами не взаимоблокируются.
    const positions = [...doc.positions].sort((a, b) =>
      a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0,
    );

    try {
      // Одна транзакция на чек: либо все позиции применены и processed,
      // либо откат целиком. Финализация fenced: processed ставит только
      // владелец claim-а (status='received' и received_at не изменился) —
      // перехваченный после 5 минут claim откатывает «зависшего» целиком.
      await this.db.transaction(async (tx) => {
        for (const pos of positions) {
          const delta = sign * pos.quantity;
          const updated = await tx
            .update(evotorProducts)
            .set({
              quantity: sql`${evotorProducts.quantity} + ${String(delta)}`,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(evotorProducts.storeId, doc.storeId!),
                eq(evotorProducts.evotorUuid, pos.productId),
              ),
            )
            .returning({ uuid: evotorProducts.evotorUuid });

          await tx.insert(syncLog).values({
            direction: 'import',
            entity: 'receipt',
            storeId: doc.storeId,
            evotorUuid: pos.productId,
            status: updated.length ? 'ok' : 'error',
            payload: { doc: doc.uuid, type: doc.type, delta },
            error: updated.length
              ? null
              : 'товар не найден в реплике — добёрет ночная сверка',
          });
        }
        const done = await tx
          .update(webhookEvents)
          .set({ status: 'processed', error: null, processedAt: sql`now()` })
          .where(
            and(
              eq(webhookEvents.source, 'evotor'),
              eq(webhookEvents.eventId, eventId),
              sql`${webhookEvents.status} = 'received'`,
              sql`${webhookEvents.receivedAt} = ${claim.claimedAt}::timestamptz`,
            ),
          )
          .returning({ id: webhookEvents.id });
        if (done.length === 0) {
          throw new Error('claim перехвачен параллельной доставкой — откат');
        }
      });
      await this.cache.invalidatePrefix('catalog:');
      this.log.log(
        `Чек ${doc.type} ${doc.uuid}: обновлено позиций — ${positions.length}`,
      );
    } catch (err) {
      this.log.error(`Чек ${doc.uuid}: ${(err as Error).message}`);
      // Фенсим по нашему claimedAt: если чек уже перехвачен параллельной
      // доставкой, наш 'failed' не должен погасить её живой claim.
      await this.markEvent(
        eventId,
        'failed',
        (err as Error).message,
        claim.claimedAt,
      ).catch(() => undefined);
      throw err; // не-200 → Эвотор передоставит → claim оживит 'failed'
    }
  }

  /**
   * Push номенклатуры (ТЗ-3): upsert товаров в реплику магазина.
   * Новый товар попадает ТОЛЬКО в реплику — на витрине его нет, пока
   * контент-менеджер не создаст карточку в Strapi (появляется «скрытым»).
   */
  async handleProductsPush(storeUuid: string, body: unknown): Promise<void> {
    const eventId = `products:${storeUuid}:${this.hashOf(body)}`;
    if (!Array.isArray(body)) {
      // Не массив — формат неожиданный; НЕ processed, чтобы был виден разбор.
      await this.claimEvent(eventId, 'unparsed', { storeUuid, body });
      this.log.warn(
        `Push номенклатуры ${storeUuid}: тело не массив, сохранено для разбора`,
      );
      return;
    }
    const items = body;
    const claim = await this.claimEvent(eventId, 'products-push', {
      storeUuid,
      items,
    });
    if (claim.kind === 'duplicate') return;
    if (claim.kind === 'busy') {
      throw new ServiceUnavailableException(
        'Push уже обрабатывается — повторите доставку',
      );
    }

    try {
      // Первый пуш после установки может прийти раньше синка магазинов —
      // заглушка удовлетворяет FK; имя/адрес заполнит импорт (ТЗ-1).
      await this.db
        .insert(evotorStores)
        .values({ id: storeUuid, name: `Эвотор ${storeUuid}` })
        .onConflictDoNothing({ target: evotorStores.id });

      let ok = 0;
      let failed = 0;
      for (const item of items) {
        const p = parseProductPush(item);
        if (!p || p.group) continue; // группы в реплике товаров не храним
        try {
          const matchKey = buildMatchKey(p);
          // Абсолютный quantity из запоздавшего/повторного пуша не должен
          // перебивать дельты чеков, применённые ПОСЛЕ его первого прихода.
          // По контракту (§8) в теле пуша timestamp-а НЕТ — по умолчанию
          // меткой свежести служит first_received_at события; если Эвотор
          // всё же прислал updated_at — используем его. Окно «касса
          // сформировала снимок → доставила» неустранимо и закрывается
          // полной пересверкой ночной сверкой (ТЗ-5).
          const pushedAtRaw = p.raw['updated_at'] ?? p.raw['updatedAt'];
          const pushedAt =
            typeof pushedAtRaw === 'string' ? new Date(pushedAtRaw) : null;
          const freshTs =
            pushedAt && !Number.isNaN(+pushedAt)
              ? pushedAt.toISOString()
              : claim.firstReceivedAt;

          await this.db
            .insert(evotorProducts)
            .values({
              storeId: storeUuid,
              evotorUuid: p.uuid,
              name: p.name,
              priceKopecks: p.priceKopecks ?? 0,
              costPriceKopecks: p.costPriceKopecks,
              quantity: p.quantity !== null ? String(p.quantity) : '0',
              measure: p.measure ?? 'шт',
              groupUuid: p.parentUuid,
              barcodes: p.barcodes,
              article: p.article,
              code: p.code,
              evotorType: p.evotorType,
              isMarked: p.isMarked,
              allowToSell: p.allowToSell ?? true,
              isArchived: p.removed,
              matchKey,
              raw: p.raw,
            })
            .onConflictDoUpdate({
              target: [evotorProducts.storeId, evotorProducts.evotorUuid],
              set: {
                name: p.name,
                matchKey,
                barcodes: p.barcodes,
                article: p.article,
                code: p.code,
                groupUuid: p.parentUuid,
                evotorType: p.evotorType,
                isMarked: p.isMarked,
                isArchived: p.removed,
                raw: p.raw,
                // Отсутствующие в push-е поля не затираем (частичные пуши).
                ...(p.priceKopecks !== null && { priceKopecks: p.priceKopecks }),
                ...(p.costPriceKopecks !== null && {
                  costPriceKopecks: p.costPriceKopecks,
                }),
                ...(p.quantity !== null && {
                  quantity: sql`case when ${evotorProducts.updatedAt} > ${freshTs}::timestamptz then ${evotorProducts.quantity} else ${String(p.quantity)}::numeric end`,
                }),
                ...(p.measure !== null && { measure: p.measure }),
                ...(p.allowToSell !== null && { allowToSell: p.allowToSell }),
                syncedAt: sql`now()`,
                updatedAt: sql`now()`,
              },
            });
          ok += 1;
        } catch (err) {
          failed += 1;
          try {
            await this.db.insert(syncLog).values({
              direction: 'import',
              entity: 'product',
              storeId: storeUuid,
              evotorUuid: p.uuid,
              status: 'error',
              error: (err as Error).message,
            });
          } catch (logErr) {
            // Журнал сам не должен ронять обработку.
            this.log.error(
              `sync_log недоступен для ${p.uuid}: ${(logErr as Error).message}`,
            );
          }
        }
      }

      await this.db.insert(syncLog).values({
        direction: 'import',
        entity: 'product',
        storeId: storeUuid,
        status: failed ? 'error' : 'ok',
        payload: { pushed: items.length, upserted: ok, failed },
        error: failed ? `не применилось товаров: ${failed}` : null,
      });
      await this.cache.invalidatePrefix('catalog:');
      if (failed) {
        this.log.error(
          `Push номенклатуры ${storeUuid}: не применилось ${failed} из ${items.length}`,
        );
        // Частичный провал: 'failed' + не-200 → Эвотор передоставит,
        // upsert-ы идемпотентны, недоехавшие товары получат второй шанс.
        await this.markEvent(
          eventId,
          'failed',
          `не применилось товаров: ${failed}`,
        );
        throw new Error(`push применён частично (${ok}/${items.length})`);
      }
      await this.markEvent(eventId, 'processed');
      this.log.log(
        `Push номенклатуры ${storeUuid}: upsert ${ok} из ${items.length}`,
      );
    } catch (err) {
      this.log.error(
        `Push номенклатуры ${storeUuid}: ${(err as Error).message}`,
      );
      await this.markEvent(eventId, 'failed', (err as Error).message).catch(
        () => undefined,
      );
      throw err; // не-200 → Эвотор передоставит → claim оживит 'failed'
    }
  }

  // ---------- страховочный поллинг документов (ТЗ р.10.3) ----------

  /**
   * Дочитывает документы движения из Cloud API за окно pollLookbackH и
   * прогоняет через тот же handleReceipt. Дедуп по uuid документа гарантирует,
   * что уже применённый вебхуком документ не спишется повторно — недоставленный
   * вебхук догоняется в пределах периода поллинга, а не суток. ТОЛЬКО ЧТЕНИЕ
   * Эвотора. GET /documents не отдаёт store в элементе — подставляем из пути.
   * Нет токена/доступа — тихо пропускаем (dev/до установки приложения).
   */
  async pollDocuments(): Promise<void> {
    if (!(await this.api.hasAccess())) return; // токена нет — поллинг неактивен
    const sinceMs = Date.now() - this.pollLookbackH * 3_600_000;
    let stores: Array<{ id: string }>;
    try {
      stores = await this.api.listStores();
    } catch (err) {
      this.log.warn(
        `Поллинг: список магазинов недоступен: ${(err as Error).message}`,
      );
      // Отказ инфраструктуры поллинга — в журнал, чтобы мониторинг заметил
      // «страховка от недоставки вебхуков не работает» (ТЗ п.9).
      await this.logPoll('error', { stage: 'listStores' }, (err as Error).message);
      return;
    }
    let seen = 0;
    const skipped: string[] = []; // магазины, где наше приложение не установлено
    const failed: string[] = []; //  настоящие ошибки чтения (инфра/токен)
    for (const store of stores) {
      try {
        const docs = await this.api.getDocuments(
          store.id,
          sinceMs,
          this.pollTypes,
        );
        for (const doc of docs) {
          seen += 1;
          // storeUuid подставляем сами: элемент GET /documents его не содержит.
          await this.handleReceipt({ ...doc, storeUuid: store.id }).catch(
            (e: Error) =>
              this.log.warn(`Поллинг: документ не применён: ${e.message}`),
          );
        }
      } catch (err) {
        const msg = (err as Error).message;
        // 402 = приложение не установлено/не оплачено на кассах ЭТОГО магазина:
        // это не поломка поллинга, а «магазин ещё не подключён» — не алертим.
        if (msg.includes('402')) {
          skipped.push(store.id);
          this.log.warn(
            `Поллинг: магазин ${store.id} — приложение не установлено на кассах (402), пропуск`,
          );
        } else {
          failed.push(store.id);
          this.log.warn(`Поллинг магазина ${store.id}: ${msg}`);
        }
      }
    }
    // 'error' только на реальный сбой, ИЛИ если недоступны ВСЕ магазины (полная
    // потеря доступа). Один не подключённый магазин при живом другом — это 'ok'.
    const allSkipped = stores.length > 0 && skipped.length === stores.length;
    await this.logPoll(
      failed.length || allSkipped ? 'error' : 'ok',
      {
        seen,
        stores: stores.length,
        ...(skipped.length && { skipped }),
        ...(failed.length && { failed }),
      },
      failed.length
        ? `ошибка чтения магазинов: ${failed.join(', ')}`
        : allSkipped
          ? 'приложение не установлено ни на одном магазине'
          : undefined,
    );
    if (seen)
      this.log.log(
        `Поллинг документов: просмотрено ${seen} за ${this.pollLookbackH}ч`,
      );
  }

  /** Журнал прогона поллинга (entity='poll') — источник мониторинга (ТЗ п.9). */
  private async logPoll(
    status: 'ok' | 'error',
    payload: Record<string, unknown>,
    error?: string,
  ): Promise<void> {
    await this.db
      .insert(syncLog)
      .values({ direction: 'import', entity: 'poll', status, payload, error: error ?? null })
      .catch(() => undefined); // журнал не должен ронять поллинг
  }

  // ---------- ротация журналов ----------

  onModuleInit(): void {
    // ТЗ р.10.3: журналы храним ≥90 дней — чистим старше, раз в сутки.
    const purge = () =>
      this.purgeOldLogs().catch((err: Error) =>
        this.log.error(`ротация журналов: ${err.message}`),
      );
    purge();
    this.sweeper = setInterval(purge, 24 * 60 * 60 * 1000);
    this.sweeper.unref?.();

    // ТЗ р.10.3: страховочный поллинг документов (EVOTOR_POLL_MINUTES; 0 = выкл).
    if (this.pollMinutes > 0) {
      const poll = () =>
        this.pollDocuments().catch((err: Error) =>
          this.log.error(`поллинг документов: ${err.message}`),
        );
      this.poller = setInterval(poll, this.pollMinutes * 60_000);
      this.poller.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    if (this.poller) clearInterval(this.poller);
  }

  private async purgeOldLogs(): Promise<void> {
    await this.db
      .delete(webhookEvents)
      .where(lt(webhookEvents.receivedAt, sql`now() - interval '90 days'`));
    await this.db
      .delete(syncLog)
      .where(lt(syncLog.createdAt, sql`now() - interval '90 days'`));
  }

  // ---------- служебное ----------

  /**
   * Claim события с дедупликацией.
   * claimed — событие наше (вставили новое или оживили 'failed' /
   *   брошенный 'received' старше 5 минут); claimedAt — фенс-токен владения.
   * duplicate — уже processed: дубликат, отвечаем 200 без работы.
   * busy — свежий 'received': его прямо сейчас держит параллельная
   *   доставка; отвечаем 503 — Эвотор повторит, и повтор либо увидит
   *   processed, либо переживёт 5-минутный порог и заберёт claim.
   */
  private async claimEvent(
    eventId: string,
    type: string,
    payload: unknown,
  ): Promise<Claim> {
    const claimed = await this.db
      .insert(webhookEvents)
      .values({
        source: 'evotor',
        eventId,
        type,
        payload: payload ?? {},
      })
      .onConflictDoUpdate({
        target: [webhookEvents.source, webhookEvents.eventId],
        set: { status: 'received', error: null, receivedAt: sql`now()` },
        setWhere: sql`${webhookEvents.status} = 'failed' or (${webhookEvents.status} = 'received' and ${webhookEvents.receivedAt} < now() - interval '5 minutes')`,
      })
      .returning({
        claimedAt: sql<string>`${webhookEvents.receivedAt}::text`,
        firstReceivedAt: sql<string>`${webhookEvents.firstReceivedAt}::text`,
      });
    if (claimed.length) {
      return {
        kind: 'claimed',
        claimedAt: claimed[0].claimedAt,
        firstReceivedAt: claimed[0].firstReceivedAt,
      };
    }
    const [row] = await this.db
      .select({ status: webhookEvents.status })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.source, 'evotor'),
          eq(webhookEvents.eventId, eventId),
        ),
      );
    return row && row.status !== 'processed'
      ? { kind: 'busy' }
      : { kind: 'duplicate' };
  }

  private async markEvent(
    eventId: string,
    status: 'processed' | 'failed',
    error?: string,
    fenceReceivedAt?: string,
  ): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ status, error: error ?? null, processedAt: sql`now()` })
      .where(
        and(
          eq(webhookEvents.source, 'evotor'),
          eq(webhookEvents.eventId, eventId),
          // 'failed' не должен перетирать зафиксированный 'processed'
          // (напр. неопределённый исход COMMIT-а при обрыве соединения).
          ...(status === 'failed'
            ? [sql`${webhookEvents.status} <> 'processed'`]
            : []),
          // Fenced-провал: если наш claim перехватила параллельная доставка
          // (received_at уже другой), НЕ гасим её живой 'received' — иначе её
          // fenced-финализация не сойдётся и она откатит верные дельты.
          ...(fenceReceivedAt
            ? [sql`${webhookEvents.receivedAt} = ${fenceReceivedAt}::timestamptz`]
            : []),
        ),
      );
  }

  private hashOf(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? null))
      .digest('hex')
      .slice(0, 32);
  }
}
