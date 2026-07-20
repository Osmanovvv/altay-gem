/**
 * Чистая логика фискального чека 54-ФЗ (Этап 3, шаг 3).
 *
 * Чек уходит объектом `receipt` вместе с запросом платежа ЮKassa — ЮKassa
 * ЕДИНАЯ точка фискализации: она формирует чек своим сервисом («Чеки от
 * ЮKassa») ИЛИ передаёт данные в подключённую к ней онлайн-кассу (в т.ч.
 * облачную кассу Эвотора). Отдельной интеграции с кассой на нашей стороне не
 * нужно. Здесь — только сборка объекта чека; HTTP и секреты в payment.service.
 *
 * ГЛАВНЫЙ ИНВАРИАНТ 54-ФЗ: Σ(amount.value × quantity) по позициям == сумме
 * платежа. Скидка распределяется по строкам (largest-remainder), при
 * неделимости на единицы строка дробится на две — до копейки точно.
 *
 * Бизнес-значения (vat_code/tax_system_code/payment_mode) задаёт конфиг: они
 * зависят от СНО и учётной политики заказчицы — подтверждает её бухгалтер.
 */

import { formatAmount } from './yookassa';

/** Позиция заказа для чека: цена за единицу (копейки) и целое количество. */
export interface ReceiptLineInput {
  description: string;
  priceKopecks: number;
  quantity: number;
  /**
   * Подпадает ли строка под скидку промокода. false — скидка на неё не
   * распределяется (категорийный промокод: скидка только на свою категорию).
   * По умолчанию true.
   */
  discountEligible?: boolean;
  /** Маркированный товар («Честный знак»): чек обязан нести коды (шаг 4). */
  isMarked?: boolean;
  /**
   * Отсканированные при сборке коды Data Matrix — ровно по одному НА ЕДИНИЦУ
   * товара (у каждой бутылки/пачки свой код). Длина обязана равняться quantity.
   */
  markCodes?: string[] | null;
}

export interface ReceiptCustomer {
  email?: string | null;
  phone?: string | null;
}

export interface ReceiptConfig {
  /** Ставка НДС (ФФД/ЮKassa): 1 Без НДС, 2 0%, 3 10%, 4 20%, 5 10/110, 6 20/120. */
  vatCode: number;
  /** Признак способа расчёта: full_payment | full_prepayment | ... */
  paymentMode: string;
  /** Единица измерения (ФФД 1.2). Не задан — поле не шлём (совместимо с 1.05). */
  measure?: string;
  /** Код СНО (1..6). Обязателен, только если у аккаунта несколько СНО. */
  taxSystemCode?: number;
}

export interface ReceiptItem {
  description: string;
  /** Количество — СТРОКА (ЮKassa: "2.000", как и amount.value), не число. */
  quantity: string;
  amount: { value: string; currency: 'RUB' };
  vat_code: number;
  payment_subject: string;
  payment_mode: string;
  measure?: string;
  /** Код маркировки единицы товара (ФФД 1.2): gs_1m = сырой Data Matrix. */
  mark_code_info?: { gs_1m: string };
  /** Режим обработки кода маркировки; 0 — штучная продажа (тег 2102). */
  mark_mode?: number;
}

export interface Receipt {
  customer: { email?: string; phone?: string };
  items: ReceiptItem[];
  tax_system_code?: number;
}

/** Тело POST /receipts — отложенный чек по уже принятой оплате (шаг 4). */
export interface PostPaymentReceipt extends Receipt {
  type: 'payment';
  payment_id: string;
  /**
   * Расчёт: cashless — безнал на всю сумму (ремонтный чек полного расчёта);
   * prepayment — ЗАЧЁТ ранее пробитой предоплаты (маркированный заказ:
   * чек предоплаты ушёл при оплате, этот чек передаёт товар с кодами).
   */
  settlements: Array<{
    type: 'cashless' | 'prepayment';
    amount: { value: string; currency: 'RUB' };
  }>;
  send: boolean;
  /** Часовой пояс чека (1..11 = UTC+2..UTC+12); обязателен при маркировке. */
  timezone?: number;
}

const DESCRIPTION_MAX = 128; // лимит ЮKassa на наименование предмета расчёта

/**
 * Рубли → ЦЕЛЫЕ копейки. `rub * 100` для дробных сумм (тариф 300.03 из
 * Strapi-decimal, копеечные цены Эвотора) даёт float-хвост
 * (30002.999999999996): PG отвергает его в integer-колонке (заказ падает
 * 500-кой), а ЮKassa получает малформный amount. Все денежные точки обязаны
 * ходить через этот хелпер.
 */
export function rubToKopecks(rub: number): number {
  return Math.round(rub * 100);
}

/** Лимит ЮKassa: «в чеке не более 80 товаров» (доки, раздел о чеках). */
export const RECEIPT_MAX_ITEMS = 80;

/**
 * Превышен лимит позиций чека. Отдельный класс, чтобы вызывающий код мог
 * отличить его от прочих ошибок сборки: при создании заказа это ЧЁТКИЙ отказ
 * покупателю («разделите заказ»), а не деградация «платёж без чека».
 */
export class ReceiptLimitError extends Error {}

/**
 * ВЕРХНЯЯ оценка числа позиций будущего чека — для прегейта при создании
 * заказа, пока коды маркировки ещё не отсканированы и чек не собрать:
 *  - маркированная строка развернётся по единицам (код на каждую) → quantity;
 *  - обычная строка при распределении скидки может раздвоиться → 2, иначе 1;
 *  - платная доставка — отдельная позиция.
 * Оценка не меньше фактической, поэтому прошедший прегейт заказ гарантированно
 * фискализируется без превышения лимита и ПОСЛЕ оплаты.
 */
export function receiptPositionsUpperBound(
  lines: Array<{ quantity: number; isMarked?: boolean }>,
  deliveryKopecks: number,
  hasDiscount: boolean,
): number {
  const linePositions = lines.reduce(
    (sum, l) => sum + (l.isMarked ? l.quantity : hasDiscount ? 2 : 1),
    0,
  );
  return linePositions + (deliveryKopecks > 0 ? 1 : 0);
}

/**
 * Скидка, покрывающая ВСЮ стоимость подпадающих строк, детерминированно
 * обнуляет каждую из них (allocate раздаёт каждой её полный gross). Если среди
 * них есть маркированная — чек не собрать НИКОГДА (коды обязаны попасть в
 * чек, а нулевые позиции ЮKassa отвергает), причём для маркированного заказа
 * это выяснилось бы только ПОСЛЕ оплаты (отложенная фискализация). Прегейт
 * для create(): ловим состав «100%-промо + маркированный товар» до денег.
 */
export function discountZeroesMarkedLine(
  lines: Array<{
    priceKopecks: number;
    quantity: number;
    discountEligible?: boolean;
    isMarked?: boolean;
  }>,
  discountKopecks: number,
): boolean {
  if (discountKopecks <= 0) return false;
  const eligible = lines.filter((l) => l.discountEligible !== false);
  const eligibleGross = eligible.reduce(
    (s, l) => s + l.priceKopecks * l.quantity,
    0,
  );
  if (eligibleGross <= 0) return false;
  return (
    discountKopecks >= eligibleGross && eligible.some((l) => l.isMarked === true)
  );
}

/**
 * Распределить `total` (целое) по весам пропорционально, с гарантией точной
 * суммы: остаток от округления вниз раздаём строкам с наибольшей дробной частью.
 */
function allocate(weights: number[], total: number): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sumW);
  const out = exact.map((e) => Math.floor(e));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && byFrac.length; k++, rem--) {
    out[byFrac[k % byFrac.length].i] += 1;
  }
  return out;
}

/**
 * Строка нетто-суммой `netKopecks` на `quantity` единиц → 1 или 2 позиции чека
 * так, что Σ(amount × quantity) == netKopecks точно. Если цена за единицу не
 * делит нетто нацело, строка дробится: (q−r) ед. по floor и r ед. по floor+1.
 */
function splitLine(
  netKopecks: number,
  quantity: number,
  fields: Omit<ReceiptItem, 'amount' | 'quantity'>,
): ReceiptItem[] {
  const perUnit = Math.floor(netKopecks / quantity);
  const rem = netKopecks - perUnit * quantity;
  const item = (value: number, qty: number): ReceiptItem => ({
    ...fields,
    quantity: String(qty),
    amount: { value: formatAmount(value), currency: 'RUB' },
  });
  if (rem === 0) return [item(perUnit, quantity)];
  // perUnit=0 (net меньше числа единиц): нулевую часть не кладём — ЮKassa
  // отвергает amount "0.00"; сумма не меняется (0 × q = 0).
  if (perUnit === 0) return [item(1, rem)];
  // (quantity − rem) ед. по perUnit + rem ед. по perUnit+1 = netKopecks
  return [item(perUnit, quantity - rem), item(perUnit + 1, rem)];
}

/**
 * Маркированная строка → ПО ОДНОЙ позиции на единицу товара: каждой единице —
 * свой код Data Matrix. Суммы единиц дают netKopecks точно (первые по floor,
 * остаток по floor+1). Единицы с нулевой суммой не кладём (guard «0.00»).
 */
function expandMarkedLine(
  netKopecks: number,
  quantity: number,
  codes: string[],
  fields: Omit<ReceiptItem, 'amount' | 'quantity'>,
): ReceiptItem[] {
  const perUnit = Math.floor(netKopecks / quantity);
  const rem = netKopecks - perUnit * quantity;
  const out: ReceiptItem[] = [];
  for (let u = 0; u < quantity; u++) {
    const value = u < quantity - rem ? perUnit : perUnit + 1;
    if (value <= 0) {
      // Молча выбросить единицу нельзя: её код НЕ попал бы в чек и не был бы
      // выведен из оборота в «Честном знаке» — фискализация выглядела бы
      // успешной при нарушении маркировки. Пусть кассир решает руками.
      throw new Error(
        `«${fields.description}»: единица маркированного товара получила нулевую сумму — чек с кодом собрать нельзя`,
      );
    }
    out.push({
      ...fields,
      quantity: '1',
      amount: { value: formatAmount(value), currency: 'RUB' },
      mark_code_info: { gs_1m: codes[u] },
    });
  }
  return out;
}

/** Общие поля позиции из конфига (без суммы/количества). */
function itemFields(
  config: ReceiptConfig,
  description: string,
  paymentSubject: string,
): Omit<ReceiptItem, 'amount' | 'quantity'> {
  return {
    description: description.slice(0, DESCRIPTION_MAX),
    vat_code: config.vatCode,
    payment_subject: paymentSubject,
    payment_mode: config.paymentMode,
    ...(config.measure ? { measure: config.measure } : {}),
  };
}

/**
 * Позиции чека из строк заказа + доставки, со скидкой, распределённой по
 * товарным строкам. Σ(amount × quantity) == (Σ price×qty − discount + delivery).
 */
export function buildReceiptItems(input: {
  lines: ReceiptLineInput[];
  discountKopecks: number;
  deliveryKopecks: number;
  config: ReceiptConfig;
}): ReceiptItem[] {
  const { config } = input;
  // Копейки обязаны быть ЦЕЛЫМИ: тарифы из Strapi (decimal, напр. 300.03 ₽)
  // дают float-хвосты (300.03×100 = 30003.000000000004), от которых splitLine
  // порождает мусорные позиции с дробным quantity — ЮKassa такой чек отвергает
  // вместе с платежом (находка ревью). Квантуем на входе.
  const lines = input.lines.map((l) => ({
    ...l,
    priceKopecks: Math.round(l.priceKopecks),
  }));
  const discountKopecks = Math.round(input.discountKopecks);
  const deliveryKopecks = Math.round(input.deliveryKopecks);
  // Глобальный дедуп кодов: один Data Matrix не может встретиться в чеке
  // дважды (в т.ч. в разных строках) — ФН/ОФД отклонит такой чек.
  const allCodes = lines.flatMap((l) => (l.isMarked ? (l.markCodes ?? []) : []));
  if (new Set(allCodes).size !== allCodes.length) {
    throw new Error('Один и тот же код маркировки в нескольких позициях чека');
  }
  const gross = lines.map((l) => l.priceKopecks * l.quantity);
  // Скидку распределяем ТОЛЬКО по eligible-строкам (у неподпадающих вес 0),
  // иначе категорийный промокод занизил бы цену чужой позиции в фиск. чеке.
  const weights = lines.map((l, i) =>
    l.discountEligible === false ? 0 : gross[i],
  );
  const lineDiscount = allocate(weights, discountKopecks);
  const items: ReceiptItem[] = [];
  lines.forEach((l, i) => {
    // Маркированная строка: у КАЖДОЙ единицы свой код Data Matrix, поэтому
    // валидируем полноту (ТЗ: фискализация без полного набора кодов
    // невозможна) и разворачиваем строку на позиции по 1 шт.
    if (l.isMarked) {
      const codes = l.markCodes ?? [];
      if (codes.length !== l.quantity) {
        throw new Error(
          `«${l.description}»: кодов маркировки ${codes.length}, а единиц ${l.quantity} — чек не собрать`,
        );
      }
    }
    const net = gross[i] - lineDiscount[i];
    if (net <= 0) {
      // Маркированную строку молча выбросить нельзя: коды не попали бы в чек
      // и не вышли бы из оборота в ЧЗ при «успешной» фискализации.
      if (l.isMarked) {
        throw new Error(
          `«${l.description}»: маркированная строка со 100%-скидкой — чек с кодами собрать нельзя`,
        );
      }
      // Немаркированную позицию с нулевой суммой в чек НЕ кладём: ЮKassa
      // отвергает amount "0.00" и вместе с ним ВЕСЬ платёж.
      return;
    }
    if (l.isMarked) {
      items.push(
        ...expandMarkedLine(net, l.quantity, l.markCodes as string[], {
          ...itemFields(config, l.description, 'commodity'),
          // measure у ЮKassa обязателен для маркированной позиции; штучная
          // продажа целой единицы: mark_mode 0 (тег 2102).
          measure: config.measure ?? 'piece',
          mark_mode: 0,
        }),
      );
      return;
    }
    items.push(
      ...splitLine(
        net,
        l.quantity,
        itemFields(config, l.description, 'commodity'),
      ),
    );
  });
  if (deliveryKopecks > 0) {
    items.push(
      ...splitLine(
        deliveryKopecks,
        1,
        itemFields(config, 'Доставка', 'service'),
      ),
    );
  }
  return items;
}

/** Сумма позиций чека в копейках (то, что сверяет ЮKassa с суммой платежа). */
function itemsSumKopecks(items: ReceiptItem[]): number {
  return items.reduce(
    (s, it) =>
      s + Math.round(Number(it.amount.value) * 100) * Number(it.quantity),
    0,
  );
}

/**
 * Собрать объект чека для запроса платежа. Контакт покупателя обязателен (чек
 * некому отправить без email/телефона); email в приоритете. Защитный инвариант:
 * если сумма позиций разошлась с totalKopecks — бросаем (не отправляем кривой
 * чек, который ЮKassa всё равно отклонит).
 */
export function buildReceipt(input: {
  lines: ReceiptLineInput[];
  discountKopecks: number;
  deliveryKopecks: number;
  totalKopecks: number;
  customer: ReceiptCustomer;
  config: ReceiptConfig;
}): Receipt {
  const email = input.customer.email?.trim() || null;
  const phone = input.customer.phone?.trim() || null;
  if (!email && !phone) {
    throw new Error('Чек не отправить: нет ни email, ни телефона покупателя');
  }
  const items = buildReceiptItems(input);
  if (!items.length) {
    // всё бесплатно/нулевой итог — чек некорректен; платёж на 0 ₽ не создаётся
    throw new Error('Чек без позиций (нулевой итог) — не отправляем');
  }
  // Лимит ЮKassa «не более 80 товаров в чеке»: маркированные строки
  // развёрнуты по единицам, поэтому крупный заказ превышает лимит незаметно —
  // ЮKassa отклонила бы чек (а с ним и платёж/фискализацию).
  if (items.length > RECEIPT_MAX_ITEMS) {
    throw new ReceiptLimitError(
      `Позиций в чеке ${items.length} — больше лимита ЮKassa (${RECEIPT_MAX_ITEMS})`,
    );
  }
  // totalKopecks может прийти с float-хвостом (totalRub×100) — сравниваем
  // с тем же квантованием, что и позиции (иначе ложный «чек разошёлся»).
  const totalKopecks = Math.round(input.totalKopecks);
  const sum = itemsSumKopecks(items);
  if (sum !== totalKopecks) {
    throw new Error(
      `Сумма позиций чека ${sum} ≠ сумме платежа ${totalKopecks}`,
    );
  }
  return {
    customer: email ? { email } : { phone: phone as string },
    items,
    ...(input.config.taxSystemCode !== undefined
      ? { tax_system_code: input.config.taxSystemCode }
      : {}),
  };
}

/**
 * Отложенный чек по уже принятой оплате (шаг 4, POST /receipts): маркированный
 * заказ фискализируется ПОСЛЕ сборки, когда коды отсканированы. Расчёт —
 * cashless на всю сумму (деньги приняты ЮKassa онлайн); timezone обязателен
 * при маркировке (1..11 = UTC+2..UTC+12, Новосибирск = 6).
 */
export function buildPostPaymentReceipt(input: {
  lines: ReceiptLineInput[];
  discountKopecks: number;
  deliveryKopecks: number;
  totalKopecks: number;
  customer: ReceiptCustomer;
  config: ReceiptConfig;
  paymentId: string;
  timezone?: number;
  /**
   * prepayment — зачёт ранее пробитой предоплаты (маркированный заказ,
   * дизайн подтверждён песочницей 20.07); по умолчанию cashless.
   */
  settlementType?: 'cashless' | 'prepayment';
}): PostPaymentReceipt {
  const receipt = buildReceipt(input);
  return {
    ...receipt,
    type: 'payment',
    payment_id: input.paymentId,
    settlements: [
      {
        type: input.settlementType ?? 'cashless',
        amount: {
          value: formatAmount(Math.round(input.totalKopecks)),
          currency: 'RUB',
        },
      },
    ],
    send: true,
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  };
}
