import { describe, expect, it } from 'bun:test';
import {
  RECEIPT_MAX_ITEMS,
  ReceiptLimitError,
  buildReceipt,
  lineNetsAfterDiscount,
  markedLineUnfiscalizable,
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

describe('markedLineUnfiscalizable (точный прегейт: net < quantity маркированной строки)', () => {
  // RESIDUAL-кейс, который старая аппроксимация discountZeroesMarkedLine
  // ПРОПУСКАЛА: discount 9999 < eligibleGross 10000 → старая давала false,
  // хотя allocate отдаёт маркированной строке (вес 100 из 10000) её полный
  // gross 100 → её net = 0 < 1 → чек с кодом собрать нельзя. Это и есть гэп,
  // из-за которого маркированный заказ застревал бы уже ПОСЛЕ оплаты.
  it('residual: discount < eligibleGross, но allocate зануляет маркир. строку → true', () => {
    expect(
      markedLineUnfiscalizable(
        [
          { priceKopecks: 100, quantity: 1, isMarked: true, discountEligible: true },
          { priceKopecks: 9900, quantity: 1, discountEligible: true },
        ],
        9999,
      ),
    ).toBe(true);
  });

  it('100% на все eligible строки, среди них маркированная (net 0) → true', () => {
    // weights [50000, 30000], allocate(_, 80000) → [50000, 30000] → nets [0, 0]
    expect(
      markedLineUnfiscalizable(
        [
          { priceKopecks: 50000, quantity: 1, isMarked: true, discountEligible: true },
          { priceKopecks: 30000, quantity: 1, discountEligible: true },
        ],
        80000,
      ),
    ).toBe(true);
  });

  it('quantity>1: net < quantity (единице не хватит копейки) → true', () => {
    // gross 200, discount 199 → net 1 < quantity 2 (perUnit=0 у части единиц)
    expect(
      markedLineUnfiscalizable(
        [{ priceKopecks: 100, quantity: 2, isMarked: true, discountEligible: true }],
        199,
      ),
    ).toBe(true);
  });

  it('нет маркированных строк → false (нулевую немаркир. просто выкинут)', () => {
    // тот же residual-состав, но без isMarked: net [0, 1], но некому падать
    expect(
      markedLineUnfiscalizable(
        [
          { priceKopecks: 100, quantity: 1, discountEligible: true },
          { priceKopecks: 9900, quantity: 1, discountEligible: true },
        ],
        9999,
      ),
    ).toBe(false);
  });

  it('без скидки → false', () => {
    expect(
      markedLineUnfiscalizable(
        [{ priceKopecks: 50000, quantity: 1, isMarked: true, discountEligible: true }],
        0,
      ),
    ).toBe(false);
  });

  it('маркир. net ≥ quantity (собирается) → false', () => {
    // residual-состав, discount 9000 → nets [10, 990]: маркир. net 10 ≥ 1
    expect(
      markedLineUnfiscalizable(
        [
          { priceKopecks: 100, quantity: 1, isMarked: true, discountEligible: true },
          { priceKopecks: 9900, quantity: 1, discountEligible: true },
        ],
        9000,
      ),
    ).toBe(false);
  });

  it('quantity>1: net ровно = quantity (по 1 коп/ед., собирается) → false', () => {
    // gross 200, discount 198 → net 2 == quantity 2: 2 < 2 неверно → false
    expect(
      markedLineUnfiscalizable(
        [{ priceKopecks: 100, quantity: 2, isMarked: true, discountEligible: true }],
        198,
      ),
    ).toBe(false);
  });

  it('маркир. строка НЕ eligible (категорийный промо) — скидка её не трогает → false', () => {
    // weights [0, 9900]: маркир. net остаётся 100 ≥ 1, скидка ушла в другую строку
    expect(
      markedLineUnfiscalizable(
        [
          { priceKopecks: 100, quantity: 1, isMarked: true, discountEligible: false },
          { priceKopecks: 9900, quantity: 1, discountEligible: true },
        ],
        9900,
      ),
    ).toBe(false);
  });
});

describe('lineNetsAfterDiscount (единый источник net для чека и прегейта)', () => {
  it('Σ nets = Σ gross − discount (точная сумма после largest-remainder)', () => {
    const nets = lineNetsAfterDiscount(
      [
        { priceKopecks: 100, quantity: 1, discountEligible: true },
        { priceKopecks: 9900, quantity: 1, discountEligible: true },
      ],
      9999,
    );
    expect(nets).toEqual([0, 1]);
    expect(nets.reduce((a, b) => a + b, 0)).toBe(10000 - 9999);
  });

  it('скидка раздаётся ТОЛЬКО по eligible-строкам (вес 0 у неподпадающих)', () => {
    // weights [0, 9900], discount 900 → неподпадающая строка нетронута (100),
    // вся скидка ушла в eligible (9900 − 900 = 9000)
    const nets = lineNetsAfterDiscount(
      [
        { priceKopecks: 100, quantity: 1, discountEligible: false },
        { priceKopecks: 9900, quantity: 1, discountEligible: true },
      ],
      900,
    );
    expect(nets).toEqual([100, 9000]);
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
