import { describe, expect, it } from 'bun:test';
import {
  RECEIPT_MAX_ITEMS,
  ReceiptLimitError,
  buildReceipt,
  discountZeroesMarkedLine,
  receiptPositionsUpperBound,
  type ReceiptConfig,
  type ReceiptLineInput,
} from './receipt';

/**
 * Лимит «Чеков от ЮKassa»: «в чеке не более 80 товаров» (доки ЮKassa).
 * Маркированная строка разворачивается ПО ЕДИНИЦАМ (свой код на каждую),
 * поэтому крупный маркированный заказ легко превышает лимит — ЮKassa
 * отклонила бы чек, а для маркированного заказа это случилось бы уже ПОСЛЕ
 * оплаты (отложенная фискализация). Ловим на нашей стороне:
 *  - точный инвариант в buildReceipt (оба вида чека);
 *  - верхняя оценка receiptPositionsUpperBound для прегейта при создании
 *    заказа, когда коды ещё не отсканированы.
 */
const config: ReceiptConfig = { vatCode: 1, paymentMode: 'full_payment' };

function simpleLines(n: number): ReceiptLineInput[] {
  return Array.from({ length: n }, (_, i) => ({
    description: `Товар ${i + 1}`,
    priceKopecks: 10000,
    quantity: 1,
  }));
}

function markedLine(units: number, prefix: string): ReceiptLineInput {
  return {
    description: `Маркированный ${prefix}`,
    priceKopecks: 10000,
    quantity: units,
    isMarked: true,
    markCodes: Array.from({ length: units }, (_, i) => `dm-${prefix}-${i}`),
  };
}

function build(lines: ReceiptLineInput[], totalKopecks: number) {
  return buildReceipt({
    lines,
    discountKopecks: 0,
    deliveryKopecks: 0,
    totalKopecks,
    customer: { email: 'a@b.ru' },
    config,
  });
}

describe('лимит 80 позиций в чеке', () => {
  it('константа лимита = 80 (доки ЮKassa)', () => {
    expect(RECEIPT_MAX_ITEMS).toBe(80);
  });

  it('81 обычная строка → ReceiptLimitError', () => {
    expect(() => build(simpleLines(81), 81 * 10000)).toThrow(ReceiptLimitError);
  });

  it('ровно 80 строк → чек собирается', () => {
    const r = build(simpleLines(80), 80 * 10000);
    expect(r.items.length).toBe(80);
  });

  it('маркированные 81 единица (40+41) → ReceiptLimitError', () => {
    const lines = [markedLine(40, 'a'), markedLine(41, 'b')];
    expect(() => build(lines, 81 * 10000)).toThrow(ReceiptLimitError);
  });

  it('маркированные ровно 80 единиц → чек собирается (по позиции на единицу)', () => {
    const lines = [markedLine(40, 'a'), markedLine(40, 'b')];
    const r = build(lines, 80 * 10000);
    expect(r.items.length).toBe(80);
    expect(r.items.every((it) => it.quantity === '1')).toBe(true);
  });
});

describe('receiptPositionsUpperBound (прегейт до сканирования кодов)', () => {
  it('маркированные считаются по единицам, обычные — по строкам', () => {
    const n = receiptPositionsUpperBound(
      [
        { quantity: 50, isMarked: true },
        ...Array.from({ length: 30 }, () => ({ quantity: 3 })),
      ],
      0,
      false,
    );
    expect(n).toBe(80); // 50 единиц + 30 строк
  });

  it('со скидкой обычная строка может раздвоиться → считаем по 2', () => {
    const n = receiptPositionsUpperBound(
      [{ quantity: 50, isMarked: true }, ...Array.from({ length: 30 }, () => ({ quantity: 3 }))],
      0,
      true,
    );
    expect(n).toBe(110); // 50 + 30×2
  });

  it('платная доставка добавляет позицию', () => {
    expect(receiptPositionsUpperBound([{ quantity: 1 }], 30000, false)).toBe(2);
    expect(receiptPositionsUpperBound([{ quantity: 1 }], 0, false)).toBe(1);
  });
});

describe('discountZeroesMarkedLine (находка ревью: 100%-промо на маркированную категорию)', () => {
  // Сценарий: скидка == полной стоимости подпадающих строк → allocate отдаёт
  // каждой её весь gross → net 0 → маркированную строку в чек не собрать
  // НИКОГДА, а выяснится это после оплаты (отложенная фискализация).
  const marked = {
    priceKopecks: 50000,
    quantity: 1,
    discountEligible: true,
    isMarked: true,
  };
  const other = {
    priceKopecks: 30000,
    quantity: 1,
    discountEligible: false,
    isMarked: false,
  };

  it('скидка == gross подпадающих строк, среди них маркированная → true', () => {
    expect(discountZeroesMarkedLine([marked, other], 50000)).toBe(true);
  });

  it('скидка меньше gross подпадающих → false (строка не занулится)', () => {
    expect(discountZeroesMarkedLine([marked, other], 49900)).toBe(false);
  });

  it('обнуляются только НЕмаркированные → false (их просто выкинут из чека)', () => {
    expect(
      discountZeroesMarkedLine(
        [{ ...marked, isMarked: false }, other],
        50000,
      ),
    ).toBe(false);
  });

  it('100% на весь заказ (все eligible) с маркированной строкой → true', () => {
    expect(
      discountZeroesMarkedLine(
        [marked, { ...other, discountEligible: true }],
        80000,
      ),
    ).toBe(true);
  });

  it('без скидки → false', () => {
    expect(discountZeroesMarkedLine([marked], 0)).toBe(false);
  });
});

describe('дробные копейки на входе чека (находка ревью: тариф 300.03 ₽ из Strapi)', () => {
  const config: ReceiptConfig = { vatCode: 1, paymentMode: 'full_payment' };
  it('доставка 300.03 ₽ (float-копейки) → ОДНА позиция "1 × 300.03", чек сходится', () => {
    // 300.03 * 100 = 30003.000000000004 — приходит из Number(strapi decimal)
    const r = buildReceipt({
      lines: [{ description: 'Мёд', priceKopecks: 10000, quantity: 1 }],
      discountKopecks: 0,
      deliveryKopecks: 300.03 * 100,
      totalKopecks: 10000 + 300.03 * 100,
      customer: { email: 'a@b.ru' },
      config,
    });
    expect(r.items.length).toBe(2);
    const delivery = r.items[1];
    expect(delivery.quantity).toBe('1');
    expect(delivery.amount.value).toBe('300.03');
  });
});
