import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { PostPaymentReceipt } from './receipt';
import {
  type AuthoritativePayment,
  buildPaymentRequest,
  type CreatePaymentInput,
  type ParsedPayment,
  parsePaymentObject,
  parsePaymentResponse,
  yooKassaAuthHeader,
} from './yookassa';

/**
 * Платёжный сервис (Этап 3, шаг 1) — эквайер ЮKassa за узким интерфейсом.
 *
 * Принимает деньги ЮKassa (эквайер); фискальный чек 54-ФЗ — отдельный шаг
 * («Цифровая касса» Эвотора). Здесь только: создать платёж и вернуть ссылку
 * на страницу оплаты. Без ключей — no-op (заказ создаётся без paymentUrl),
 * чтобы код жил на проде до прихода доступов заказчицы.
 *
 * Чистая логика (тело/разбор/сумма) — в yookassa.ts; здесь только HTTP+секреты.
 */
@Injectable()
export class PaymentService {
  private readonly log = new Logger(PaymentService.name);
  private readonly shopId: string;
  private readonly secretKey: string;
  private readonly base: string;

  constructor(config: ConfigService) {
    this.shopId = config.get<string>('YOOKASSA_SHOP_ID', '') || '';
    this.secretKey = config.get<string>('YOOKASSA_SECRET_KEY', '') || '';
    this.base =
      config.get<string>('YOOKASSA_API_BASE', '') ||
      'https://api.yookassa.ru/v3';
  }

  /** Настроен ли эквайер (есть пара ключей). */
  get enabled(): boolean {
    return this.shopId !== '' && this.secretKey !== '';
  }

  /**
   * Создать платёж в ЮKassa. null — эквайер не настроен (ключей нет): заказ
   * остаётся без оплаты, а не падает. Бросает ServiceUnavailable, если эквайер
   * настроен, но вызов не удался — тогда покупатель увидит ошибку и повторит,
   * а неоплаченный заказ снимет автоотмена.
   */
  async createPayment(input: CreatePaymentInput): Promise<ParsedPayment | null> {
    if (!this.enabled) {
      this.log.warn(
        'ЮKassa не настроена (нет ключей) — платёж не создан, заказ без оплаты',
      );
      return null;
    }
    const res = await fetch(`${this.base}/payments`, {
      method: 'POST',
      headers: {
        Authorization: yooKassaAuthHeader(this.shopId, this.secretKey),
        // Ключ идемпотентности по заказу: повторная отправка не создаёт второй
        // платёж (ЮKassa вернёт тот же в течение суток).
        'Idempotence-Key': `payment-order-${input.orderId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPaymentRequest(input)),
    }).catch((err: Error) => {
      this.log.error(`ЮKassa недоступна: ${err.message}`);
      throw new ServiceUnavailableException('Платёжный сервис недоступен');
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.log.error(`ЮKassa вернула ${res.status}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('Не удалось создать платёж');
    }
    const json: unknown = await res.json();
    const parsed = parsePaymentResponse(json);
    this.log.log(
      `платёж ЮKassa создан: ${parsed.paymentId} для заказа ${input.orderNumber} (${parsed.status})`,
    );
    return parsed;
  }

  /**
   * Авторитетный перезапрос платежа (шаг 2, главный контроль вебхука): статус
   * берём из API ЮKassa, а не из тела уведомления (подписи у ЮKassa нет).
   *  - без ключей → null (нечего запрашивать);
   *  - 404 → null (неизвестный платёж: не зацикливаем 24ч ретраев ЮKassa);
   *  - сеть/5xx → ServiceUnavailable (транзиент: пусть ЮKassa повторит вебхук).
   */
  async getPayment(paymentId: string): Promise<AuthoritativePayment | null> {
    if (!this.enabled) return null;
    const res = await fetch(
      `${this.base}/payments/${encodeURIComponent(paymentId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: yooKassaAuthHeader(this.shopId, this.secretKey),
        },
      },
    ).catch((err: Error) => {
      this.log.error(`ЮKassa недоступна при перезапросе платежа: ${err.message}`);
      throw new ServiceUnavailableException('Платёжный сервис недоступен');
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.log.error(
        `ЮKassa вернула ${res.status} на перезапрос платежа: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException('Не удалось перезапросить платёж');
    }
    return parsePaymentObject(await res.json());
  }

  /**
   * Отложенный чек по уже принятой оплате (шаг 4, POST /receipts): маркированный
   * заказ фискализируется после сборки, когда все коды отсканированы.
   *  - без ключей → null (фискализация не настроена, продажу не блокируем);
   *  - сбой/не-2xx → ServiceUnavailable: кассир повторит фискализацию, ЮKassa
   *    по Idempotence-Key чека не задвоит.
   */
  async createReceipt(
    orderId: number,
    receipt: PostPaymentReceipt,
    salt?: string,
  ): Promise<{ receiptId: string; status: string } | null> {
    if (!this.enabled) {
      this.log.warn('ЮKassa не настроена — отложенный чек не отправлен');
      return null;
    }
    const body = JSON.stringify(receipt);
    // Ключ идемпотентности = хеш(соль + тело): повтор того же чека В РАМКАХ
    // одного захвата дедуплицируется ЮKassa, а исправленный чек ИЛИ новая
    // попытка после отклонённого (соль = новый захват) уходит новым запросом —
    // статичный ключ реплеил бы старый canceled-ответ 24 часа.
    const bodyHash = createHash('sha256')
      .update(salt ?? '')
      .update(body)
      .digest('hex')
      .slice(0, 16);
    const res = await fetch(`${this.base}/receipts`, {
      method: 'POST',
      headers: {
        Authorization: yooKassaAuthHeader(this.shopId, this.secretKey),
        'Idempotence-Key': `receipt-order-${orderId}-${bodyHash}`,
        'Content-Type': 'application/json',
      },
      body,
    }).catch((err: Error) => {
      this.log.error(`ЮKassa недоступна при отправке чека: ${err.message}`);
      throw new ServiceUnavailableException('Сервис чеков недоступен');
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.log.error(`ЮKassa вернула ${res.status} на чек: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('Не удалось отправить чек');
    }
    const json = (await res.json()) as Record<string, unknown>;
    const receiptId = typeof json.id === 'string' ? json.id : null;
    if (!receiptId) throw new Error('Ответ ЮKassa на чек без id');
    const status = typeof json.status === 'string' ? json.status : 'unknown';
    this.log.log(`чек ЮKassa создан: ${receiptId} для заказа #${orderId} (${status})`);
    return { receiptId, status };
  }

  /**
   * Актуальный статус чека (GET /receipts/{id}). Чек у ЮKassa асинхронный:
   * ответ на POST приходит pending, финал — succeeded ИЛИ canceled (касса/ОФД
   * отклонили). 404/без ключей → null; сеть/5xx → ServiceUnavailable.
   */
  async getReceipt(
    receiptId: string,
  ): Promise<{ receiptId: string; status: string } | null> {
    if (!this.enabled) return null;
    const res = await fetch(
      `${this.base}/receipts/${encodeURIComponent(receiptId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: yooKassaAuthHeader(this.shopId, this.secretKey),
        },
      },
    ).catch((err: Error) => {
      this.log.error(`ЮKassa недоступна при проверке чека: ${err.message}`);
      throw new ServiceUnavailableException('Сервис чеков недоступен');
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.log.error(`ЮKassa вернула ${res.status} на чек: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('Не удалось проверить чек');
    }
    const json = (await res.json()) as Record<string, unknown>;
    const id = typeof json.id === 'string' ? json.id : null;
    if (!id) return null;
    return {
      receiptId: id,
      status: typeof json.status === 'string' ? json.status : 'unknown',
    };
  }

  /**
   * Уже выбитый по платежу чек (GET /receipts?payment_id=...) — защита от
   * потерянного ответа: чек создан в ЮKassa, а у нас fiscalReceiptId пуст.
   * Перед повторной отправкой сверяемся, чтобы не выбить второй чек.
   */
  async findReceiptByPayment(
    paymentId: string,
  ): Promise<{ receiptId: string; status: string } | null> {
    if (!this.enabled) return null;
    const res = await fetch(
      `${this.base}/receipts?payment_id=${encodeURIComponent(paymentId)}&limit=20`,
      {
        method: 'GET',
        headers: {
          Authorization: yooKassaAuthHeader(this.shopId, this.secretKey),
        },
      },
    ).catch((err: Error) => {
      this.log.error(`ЮKassa недоступна при поиске чека: ${err.message}`);
      throw new ServiceUnavailableException('Сервис чеков недоступен');
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.log.error(
        `ЮKassa вернула ${res.status} на поиск чека: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException('Не удалось проверить чеки платежа');
    }
    const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
    // Ищем ЖИВОЙ чек прихода: canceled и чеки возврата (refund) не должны
    // маскировать реальный — иначе двойная фискализация или ложный «уже есть».
    const live = (json.items ?? []).find(
      (r) =>
        typeof r.id === 'string' &&
        (r.type === undefined || r.type === 'payment') &&
        r.status !== 'canceled',
    );
    if (!live) return null;
    return {
      receiptId: live.id as string,
      status: typeof live.status === 'string' ? live.status : 'unknown',
    };
  }
}
