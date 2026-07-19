import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module';
import { evotorInstallations } from '../db/schema';

/**
 * Клиент Cloud API Эвотора (этап 2, ТЗ р.10).
 *
 * Авторизация: per-installation ЮЗЕР-ТОКЕН Облака из evotor_installations
 * (приходит POST-ом при установке приложения). Fallback — EVOTOR_CLOUD_TOKEN
 * из env (ручной пилотный режим, поле ${token} на вкладке «Настройки»).
 * НЕ путать с EVOTOR_WEBHOOK_TOKEN (токен вкладки «Интеграция» — им Эвотор
 * авторизует свои push-и к нам; в облако с ним ходить нельзя — будет 401).
 *
 * Версионирование — через vendor media type V2; bulk-записи асинхронные
 * (задача /bulks/{id}), одиночный PATCH остатка — синхронный.
 */

const V2 = 'application/vnd.evotor.v2+json';
const V2_BULK = 'application/vnd.evotor.v2+bulk+json';

/** Товар Cloud API V2 (snake_case; quantity — только у товароучётных систем). */
export interface EvotorApiProduct {
  id: string;
  name: string;
  type?: string;
  price?: number;
  cost_price?: number;
  quantity?: number;
  code?: string;
  article_number?: string;
  barcodes?: string[];
  measure_name?: string;
  tax?: string;
  allow_to_sell?: boolean;
  parent_id?: string;
  store_id?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface EvotorStore {
  id: string;
  name?: string;
  address?: string;
  [key: string]: unknown;
}

/** Документ Cloud API (чек/движение). Позиции — в body.positions[]. */
export interface EvotorDocument {
  id: string;
  type: string;
  body?: { positions?: unknown[]; [key: string]: unknown };
  [key: string]: unknown;
}

/** Задача асинхронной bulk-операции (PUT /stores/{id}/products). */
export interface EvotorBulkTask {
  id: string;
  type?: string;
  status: 'ACCEPTED' | 'RUNNING' | 'COMPLETED' | 'DECLINED' | 'FAILED';
  details?: unknown[];
  [key: string]: unknown;
}

interface Paged<T> {
  items: T[];
  paging?: { next_cursor?: string | null };
}

@Injectable()
export class EvotorApiService {
  private readonly log = new Logger(EvotorApiService.name);
  private readonly base: string;
  private readonly fallbackToken: string;
  /**
   * Формат Authorization не подтверждён докой (голый токен vs Bearer):
   * начинаем с голого, при 401 один раз пробуем Bearer и запоминаем.
   */
  private bearerPrefix = false;

  constructor(
    config: ConfigService,
    @Inject(DB) private readonly db: Database,
  ) {
    this.base = config.get<string>('EVOTOR_API_BASE', 'https://api.evotor.ru');
    this.fallbackToken = config.get<string>('EVOTOR_CLOUD_TOKEN', '');
  }

  /** Токен активной установки (последней по времени) или fallback из env. */
  async token(): Promise<string | null> {
    const [row] = await this.db
      .select({ token: evotorInstallations.token })
      .from(evotorInstallations)
      .where(eq(evotorInstallations.active, true))
      .orderBy(desc(evotorInstallations.installedAt))
      .limit(1);
    return row?.token ?? (this.fallbackToken || null);
  }

  /** Есть ли рабочий доступ к Cloud API (установка или ручной токен). */
  async hasAccess(): Promise<boolean> {
    return (await this.token()) !== null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    contentType: string = V2,
    attempt = 0,
  ): Promise<T> {
    const token = await this.token();
    if (!token) {
      throw new ServiceUnavailableException(
        'Нет токена Эвотора: приложение ещё не установлено в ЛК клиента',
      );
    }

    const doFetch = (auth: string) =>
      fetch(this.base + path, {
        method,
        headers: {
          Authorization: auth,
          Accept: V2,
          ...(body !== undefined && { 'Content-Type': contentType }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      }).catch((err: Error) => {
        this.log.error(`Эвотор недоступен (${method} ${path}): ${err.message}`);
        throw new ServiceUnavailableException('Cloud API Эвотора недоступен');
      });

    let res = await doFetch(this.bearerPrefix ? `Bearer ${token}` : token);

    // Автоопределение формата Authorization (голый токен ↔ Bearer).
    if (res.status === 401) {
      const flipped = !this.bearerPrefix;
      const retry = await doFetch(flipped ? `Bearer ${token}` : token);
      if (retry.ok) {
        this.bearerPrefix = flipped;
        this.log.warn(
          `Authorization Эвотора: рабочий формат — ${flipped ? 'Bearer <token>' : '<token>'}`,
        );
        void res.body?.cancel().catch(() => undefined);
        res = retry;
      } else {
        // Оба варианта не прошли — токен неверный; тело ретрая освобождаем.
        void retry.body?.cancel().catch(() => undefined);
      }
    }

    // Лимиты Эвотора: 429 → пауза по Retry-After/X-RateLimit-Reset и повтор
    // (ограниченно), чтобы cursor-пагинация не начиналась с нуля.
    if (res.status === 429 && attempt < 3) {
      const waitMs = retryDelayMs(res, attempt);
      this.log.warn(
        `Эвотор 429 (${method} ${path}): пауза ${waitMs} мс, попытка ${attempt + 1}/3`,
      );
      void res.body?.cancel().catch(() => undefined);
      await new Promise((r) => setTimeout(r, waitMs));
      return this.request<T>(method, path, body, contentType, attempt + 1);
    }
    if (res.status === 429) {
      throw new ServiceUnavailableException(
        'Эвотор: превышен лимит запросов (HTTP 429)',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.log.error(
        `Эвотор ${method} ${path} -> HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`,
      );
      if (res.status === 402) {
        throw new ServiceUnavailableException(
          'Эвотор: нет активной подписки у клиента (HTTP 402)',
        );
      }
      throw new ServiceUnavailableException(
        `Cloud API Эвотора: HTTP ${res.status}`,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Все страницы cursor-пагинации (лимит Эвотора — 1000 на страницу). */
  private async fetchAll<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | null | undefined;
    for (;;) {
      const sep = path.includes('?') ? '&' : '?';
      const page = await this.request<Paged<T> | T[]>(
        'GET',
        cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path,
      );
      // Некоторые ответы — голый массив, некоторые — {items, paging}.
      if (Array.isArray(page)) return out.concat(page);
      out.push(...(page.items ?? []));
      cursor = page.paging?.next_cursor;
      if (!cursor) return out;
    }
  }

  /** Магазины клиента (GET /stores). */
  listStores(): Promise<EvotorStore[]> {
    return this.fetchAll<EvotorStore>('/stores');
  }

  /** Вся номенклатура магазина (GET /stores/{id}/products, cursor). */
  listProducts(storeId: string): Promise<EvotorApiProduct[]> {
    return this.fetchAll<EvotorApiProduct>(
      `/stores/${encodeURIComponent(storeId)}/products`,
    );
  }

  /**
   * Документы магазина за период (GET /stores/{id}/documents) — страховочный
   * поллинг против недоставленных вебхуков (ТЗ р.10.3). since/until — мс epoch;
   * type — типы через запятую (фильтруем движения товара); cursor-пагинация.
   * ТОЛЬКО ЧТЕНИЕ — в Эвотор ничего не пишем, товароучётка клиента не меняется.
   * Позиции документа — в body.positions[] (см. EvotorDocument / parseReceipt).
   */
  getDocuments(
    storeId: string,
    sinceMs: number,
    types?: string[],
    untilMs?: number,
  ): Promise<EvotorDocument[]> {
    const q = new URLSearchParams({ since: String(Math.floor(sinceMs)) });
    if (untilMs) q.set('until', String(Math.floor(untilMs)));
    if (types?.length) q.set('type', types.join(','));
    return this.fetchAll<EvotorDocument>(
      `/stores/${encodeURIComponent(storeId)}/documents?${q.toString()}`,
    );
  }

  /**
   * Записать остаток одного товара — СИНХРОННО (ТЗ-4: онлайн-заказ).
   * quantity — АБСОЛЮТНОЕ новое значение (не дельта!): новое = текущее − заказ
   * вычисляем сами до вызова.
   */
  updateStock(
    storeId: string,
    productId: string,
    quantity: number,
  ): Promise<EvotorApiProduct> {
    return this.request<EvotorApiProduct>(
      'PATCH',
      `/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`,
      { quantity },
    );
  }

  /**
   * Массовая заливка/замена товаров (≤5000) — АСИНХРОННО:
   * возвращает задачу, статус опрашивать через bulkStatus().
   */
  bulkUpsertProducts(
    storeId: string,
    products: EvotorApiProduct[],
  ): Promise<EvotorBulkTask> {
    return this.request<EvotorBulkTask>(
      'PUT',
      `/stores/${encodeURIComponent(storeId)}/products`,
      products,
      V2_BULK,
    );
  }

  /** Статус bulk-задачи (ACCEPTED → RUNNING → COMPLETED|DECLINED|FAILED). */
  bulkStatus(bulkId: string): Promise<EvotorBulkTask> {
    return this.request<EvotorBulkTask>(
      'GET',
      `/bulks/${encodeURIComponent(bulkId)}`,
    );
  }
}

/** Пауза перед повтором после 429: Retry-After → X-RateLimit-Reset → экспонента. */
function retryDelayMs(res: Response, attempt: number): number {
  const CAP = 60_000;
  const ra = Number(res.headers.get('retry-after'));
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, CAP);
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    // Заголовок бывает и в секундах epoch, и в миллисекундах.
    const ms = (reset > 1e12 ? reset : reset * 1000) - Date.now();
    if (ms > 0) return Math.min(ms, CAP);
  }
  return 1000 * 2 ** attempt;
}
