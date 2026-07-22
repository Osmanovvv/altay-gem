/**
 * Чистая логика интеграции с ЮKassa (Этап 3, шаг 1: создание платежа).
 *
 * Здесь НЕТ сети и NestJS — только сборка тела запроса и разбор ответа, чтобы
 * контракт с API ЮKassa (v3) был покрыт тестами без песочницы. HTTP-вызов и
 * секреты — в PaymentService (payment.service.ts).
 *
 * Приём денег и фискальный чек 54-ФЗ делает ЮKassa: чек уходит объектом receipt
 * В ЗАПРОСЕ платежа (сервис «Чеки от ЮKassa»). Сборка receipt — в receipt.ts;
 * решение «Чеки от ЮKassa» вместо облачной «Цифровой кассы» Эвотора — отклонение
 * от ТЗ, зафиксировано в «ПРИЁМКА — Этап 3 — отклонения.md».
 */

import type { Receipt } from './receipt';

/** Вход для создания платежа. Сумма — из копеек НАШЕЙ БД, не из клиента. */
export interface CreatePaymentInput {
  orderId: number;
  orderNumber: string;
  amountKopecks: number;
  returnUrl: string;
  customerEmail?: string | null;
  /** Фискальный чек 54-ФЗ (шаг 3): передаётся ЮKassa вместе с платежом. */
  receipt?: Receipt | null;
}

/** Тело запроса POST /v3/payments (то, что уходит в ЮKassa). */
export interface YooKassaPaymentRequest {
  amount: { value: string; currency: 'RUB' };
  capture: boolean;
  confirmation: { type: 'redirect'; return_url: string };
  description: string;
  metadata: { order_id: string };
  receipt?: Receipt;
}

/** Разобранный ответ ЮKassa — минимум, нужный шагу 1. */
export interface ParsedPayment {
  paymentId: string;
  status: string;
  confirmationUrl: string;
}

/** Авторитетный платёж из перезапроса GET /payments/{id} (шаг 2). */
export interface AuthoritativePayment {
  id: string;
  /** pending | waiting_for_capture | succeeded | canceled */
  status: string;
  paid: boolean;
  /** Сумма в копейках (из amount.value). */
  amountKopecks: number;
  /** metadata.order_id → наш id заказа (запасной путь связывания). */
  metadataOrderId: number | null;
}

/** Копейки → строка «рубли.копейки» с двумя знаками (формат ЮKassa). */
export function formatAmount(kopecks: number): string {
  if (!Number.isFinite(kopecks) || kopecks < 0) {
    throw new Error(`Некорректная сумма платежа: ${kopecks}`);
  }
  // Целочисленно, чтобы не поймать плавающий хвост на делении.
  const rub = Math.floor(kopecks / 100);
  const kop = kopecks % 100;
  return `${rub}.${String(kop).padStart(2, '0')}`;
}

/** Заголовок Basic-авторизации ЮKassa: base64(shopId:secretKey). */
export function yooKassaAuthHeader(shopId: string, secretKey: string): string {
  return 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
}

/**
 * Тело платежа. capture:true — одностадийная оплата (деньги списываются сразу,
 * без отдельного подтверждения). return_url — куда ЮKassa вернёт покупателя
 * после оплаты (наша страница заказа). metadata.order_id — по нему вебхук
 * (шаг 2) найдёт заказ.
 */
export function buildPaymentRequest(
  input: CreatePaymentInput,
): YooKassaPaymentRequest {
  return {
    amount: { value: formatAmount(input.amountKopecks), currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: input.returnUrl },
    description: `Заказ ${input.orderNumber}`,
    metadata: { order_id: String(input.orderId) },
    // Чек 54-ФЗ (шаг 3): ЮKassa фискализирует его при оплате. Нет — платёж
    // без чека (фискализация не настроена), заказ не блокируем.
    ...(input.receipt ? { receipt: input.receipt } : {}),
  };
}

/** Разбор ответа ЮKassa. Кидает, если нет id или ссылки — молча не глотаем. */
export function parsePaymentResponse(body: unknown): ParsedPayment {
  if (!body || typeof body !== 'object') {
    throw new Error('Ответ ЮKassa не является объектом');
  }
  const b = body as Record<string, unknown>;
  const paymentId = typeof b.id === 'string' ? b.id : null;
  const status = typeof b.status === 'string' ? b.status : null;
  const confirmation =
    b.confirmation && typeof b.confirmation === 'object'
      ? (b.confirmation as Record<string, unknown>)
      : {};
  const confirmationUrl =
    typeof confirmation.confirmation_url === 'string'
      ? confirmation.confirmation_url
      : null;

  if (!paymentId) throw new Error('Ответ ЮKassa без id платежа');
  if (!status) throw new Error('Ответ ЮKassa без статуса');
  if (!confirmationUrl) {
    throw new Error('Ответ ЮKassa без confirmation_url — покупателю некуда идти');
  }
  return { paymentId, status, confirmationUrl };
}

/**
 * Разбор объекта платежа при перезапросе (шаг 2). Сумма — целочисленно в
 * копейках (Math.round от value*100), чтобы сверять с суммой заказа точно, без
 * плавающего хвоста. Бросает при отсутствии id/статуса/суммы.
 */
export function parsePaymentObject(body: unknown): AuthoritativePayment {
  if (!body || typeof body !== 'object') {
    throw new Error('Платёж ЮKassa не является объектом');
  }
  const b = body as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id : null;
  const status = typeof b.status === 'string' ? b.status : null;
  const amount =
    b.amount && typeof b.amount === 'object'
      ? (b.amount as Record<string, unknown>)
      : {};
  const value = typeof amount.value === 'string' ? amount.value : null;
  if (!id) throw new Error('Платёж ЮKassa без id');
  if (!status) throw new Error('Платёж ЮKassa без статуса');
  if (!value || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('Платёж ЮKassa без корректной суммы');
  }
  const amountKopecks = Math.round(Number(value) * 100);
  const meta =
    b.metadata && typeof b.metadata === 'object'
      ? (b.metadata as Record<string, unknown>)
      : {};
  const raw = meta.order_id;
  const n =
    typeof raw === 'string'
      ? Number(raw)
      : typeof raw === 'number'
        ? raw
        : Number.NaN;
  const metadataOrderId = Number.isInteger(n) && n > 0 ? n : null;
  return { id, status, paid: b.paid === true, amountKopecks, metadataOrderId };
}
