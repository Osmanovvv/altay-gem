/**
 * Чистая логика вебхука результата оплаты ЮKassa (Этап 3, шаг 2).
 *
 * Без сети и NestJS: разбор уведомления, сверка IP-источника со списком ЮKassa
 * и решение «что сделать с заказом». HTTP-приём и БД — в контроллере и
 * OrdersService; авторитетный статус берётся ПЕРЕЗАПРОСОМ платежа из API
 * (payment.service.getPayment), а не из тела уведомления.
 *
 * Верификация ЮKassa (проверено на первоисточнике yookassa.ru): HMAC-подписи
 * НЕТ. Надёжность = перезапрос статуса (главный контроль, подделка бессмысленна)
 * + IP-allowlist (второй эшелон).
 */

/** Опубликованные ЮKassa адреса/подсети, с которых приходят уведомления. */
export const YOOKASSA_WEBHOOK_IPS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
  '77.75.154.128/25',
  '2a02:5180::/32',
];

export interface WebhookNotification {
  /** payment.succeeded | payment.canceled | refund.succeeded | ... */
  event: string;
  /** object.id — id платежа/сущности, по нему перезапрашиваем статус. */
  paymentId: string;
}

/** Разбор тела уведомления. Бросает при кривом формате — молча не глотаем. */
export function parseWebhookNotification(body: unknown): WebhookNotification {
  if (!body || typeof body !== 'object') {
    throw new Error('Уведомление ЮKassa не является объектом');
  }
  const b = body as Record<string, unknown>;
  const event = typeof b.event === 'string' ? b.event : null;
  const object =
    b.object && typeof b.object === 'object'
      ? (b.object as Record<string, unknown>)
      : null;
  if (!event) throw new Error('Уведомление ЮKassa без event');
  if (!object) throw new Error('Уведомление ЮKassa без object');
  const paymentId = typeof object.id === 'string' ? object.id : null;
  if (!paymentId) throw new Error('Уведомление ЮKassa без object.id');
  return { event, paymentId };
}

// ---------- сверка IP-источника ----------

/** IPv4-строка → 32-битное значение, либо null на мусоре. */
function ipv4ToBig(ip: string): { bits: 32; value: bigint } | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return { bits: 32, value };
}

/** IPv6-строка (со сжатием «::» и встроенным IPv4) → 128 бит, либо null. */
function ipv6ToBig(ip: string): { bits: 128; value: bigint } | null {
  const s = ip.split('%')[0]; // отбрасываем zone id (fe80::1%eth0)
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parseGroups = (part: string): bigint[] | null => {
    if (part === '') return [];
    const out: bigint[] = [];
    for (const g of part.split(':')) {
      if (g.includes('.')) {
        const v4 = ipv4ToBig(g); // встроенный IPv4 в младших 32 битах
        if (!v4) return null;
        out.push((v4.value >> 16n) & 0xffffn, v4.value & 0xffffn);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
        out.push(BigInt(parseInt(g, 16)));
      }
    }
    return out;
  };
  const head = parseGroups(halves[0]);
  if (head === null) return null;
  let groups: bigint[];
  if (halves.length === 2) {
    const tail = parseGroups(halves[1]);
    if (tail === null) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array<bigint>(missing).fill(0n), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  let value = 0n;
  for (const g of groups) value = (value << 16n) | g;
  return { bits: 128, value };
}

/** Строка IP → {семейство, значение}. IPv4-mapped IPv6 сводим к IPv4. */
function ipToBig(ip: string): { bits: 32 | 128; value: bigint } | null {
  const s = ip.trim();
  if (!s) return null;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(s);
  const v = mapped ? mapped[1] : s;
  return v.includes(':') ? ipv6ToBig(v) : ipv4ToBig(v);
}

/**
 * Входит ли ip в один из cidrs (IPv4/IPv6, точечный адрес = /32 или /128).
 * Мусор и семейство-несовпадение → false, не бросает.
 */
export function ipAllowed(
  ip: string,
  cidrs: string[] = YOOKASSA_WEBHOOK_IPS,
): boolean {
  const addr = ipToBig(ip);
  if (!addr) return false;
  for (const cidr of cidrs) {
    const [base, prefixRaw] = cidr.split('/');
    const baseAddr = ipToBig(base);
    if (!baseAddr || baseAddr.bits !== addr.bits) continue;
    const prefix = prefixRaw === undefined ? baseAddr.bits : Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > baseAddr.bits) {
      continue;
    }
    const shift = BigInt(baseAddr.bits - prefix);
    if (addr.value >> shift === baseAddr.value >> shift) return true;
  }
  return false;
}

/**
 * Реальный IP клиента из X-Forwarded-For. nginx дописывает пира (ЮKassa)
 * ПОСЛЕДНИМ ($proxy_add_x_forwarded_for), а левые значения клиент может
 * подделать → берём ПРАВЫЙ элемент. Пусто → fallback (req.ip).
 */
export function clientIpFromXff(
  xff: string | undefined,
  fallback: string,
): string {
  if (!xff) return fallback;
  const parts = xff
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : fallback;
}

// ---------- решение по платежу ----------

export interface PaymentDecisionInput {
  /** Авторитетный статус из перезапроса: succeeded|canceled|pending|... */
  paymentStatus: string;
  /** Авторитетный признак оплаты. */
  paid: boolean;
  /** Оплаченная сумма (копейки) из перезапрошенного платежа. */
  paidKopecks: number;
  /** Ожидаемая сумма заказа (копейки) из НАШЕЙ БД. */
  expectedKopecks: number;
  /** Текущий статус заказа. */
  orderStatus: string;
}

export interface PaymentDecision {
  action: 'mark_paid' | 'cancel' | 'ignore';
  /** Машинная причина — в лог и webhook_events. */
  reason: string;
  /** Требует ли ситуация ручного вмешательства (алерт исполнителю). */
  alert: boolean;
}

/**
 * Что делать с заказом по авторитетному платежу. Чистая функция: никогда не
 * помечает оплаченным при несовпадении суммы; повторные доставки идемпотентны
 * (already_paid → ignore); опасные рассинхроны (оплата отменённого, чужая
 * сумма) поднимают alert для ручного возврата.
 */
export function decidePaymentAction(i: PaymentDecisionInput): PaymentDecision {
  if (i.paymentStatus === 'succeeded') {
    if (!i.paid) return { action: 'ignore', reason: 'not_paid', alert: false };
    if (i.paidKopecks !== i.expectedKopecks) {
      return { action: 'ignore', reason: 'amount_mismatch', alert: true };
    }
    if (i.orderStatus === 'awaiting_payment') {
      return { action: 'mark_paid', reason: 'succeeded', alert: false };
    }
    if (i.orderStatus === 'cancelled') {
      // деньги пришли, а заказ уже снят автоотменой — нужен возврат покупателю
      return { action: 'ignore', reason: 'paid_but_cancelled', alert: true };
    }
    // paid/assembling/... — уже обработан ранее, повтор безопасно игнорируем
    return { action: 'ignore', reason: 'already_paid', alert: false };
  }
  if (i.paymentStatus === 'canceled') {
    if (i.orderStatus === 'awaiting_payment') {
      return { action: 'cancel', reason: 'canceled', alert: false };
    }
    return {
      action: 'ignore',
      reason: `canceled_order_${i.orderStatus}`,
      alert: false,
    };
  }
  // pending / waiting_for_capture / прочее — ждём финального статуса
  return { action: 'ignore', reason: `status_${i.paymentStatus}`, alert: false };
}
