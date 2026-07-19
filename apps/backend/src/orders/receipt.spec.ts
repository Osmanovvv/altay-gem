import { describe, expect, it } from 'bun:test';
import {
  buildPostPaymentReceipt,
  buildReceipt,
  buildReceiptItems,
  type ReceiptConfig,
} from './receipt';

/**
 * Чистая логика фискального чека 54-ФЗ (Этап 3, шаг 3). Чек уходит объектом
 * `receipt` в запрос платежа ЮKassa (единая точка: ЮKassa сама фискализирует
 * своим сервисом или через подключённую кассу — Эвотор облачную и т.п.).
 *
 * ГЛАВНЫЙ ИНВАРИАНТ: Σ(amount.value × quantity) по всем позициям == сумме
 * платежа (иначе ЮKassa отклонит чек). Скидка распределяется по строкам, при
 * неделимости на единицы строка дробится на две — до копейки точно.
 */

const cfg: ReceiptConfig = {
  vatCode: 1, // «Без НДС» — типовой УСН (значение подтверждает бухгалтер заказчицы)
  paymentMode: 'full_payment',
};

/** Сумма позиций чека в копейках (то, что проверяет ЮKassa). */
const sumKopecks = (items: ReturnType<typeof buildReceiptItems>): number =>
  items.reduce(
    (s, it) =>
      s + Math.round(Number(it.amount.value) * 100) * Number(it.quantity),
    0,
  );

describe('buildReceiptItems — инвариант суммы', () => {
  it('без скидки и доставки: одна строка price×qty', () => {
    const items = buildReceiptItems({
      lines: [{ description: 'Мёд горный', priceKopecks: 25000, quantity: 2 }],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(items).toHaveLength(1);
    expect(items[0].amount.value).toBe('250.00');
    expect(items[0].quantity).toBe('2');
    expect(items[0].payment_subject).toBe('commodity');
    expect(sumKopecks(items)).toBe(50000);
  });

  it('с доставкой: отдельная строка «Доставка» с payment_subject=service', () => {
    const items = buildReceiptItems({
      lines: [{ description: 'Мёд', priceKopecks: 25000, quantity: 2 }],
      discountKopecks: 0,
      deliveryKopecks: 30000,
      config: cfg,
    });
    expect(sumKopecks(items)).toBe(80000);
    const delivery = items.find((i) => i.payment_subject === 'service');
    expect(delivery).toBeDefined();
    expect(delivery!.amount.value).toBe('300.00');
    expect(delivery!.quantity).toBe('1');
  });

  it('скидка распределяется по строкам, сумма точная (делимый случай)', () => {
    const items = buildReceiptItems({
      lines: [
        { description: 'A', priceKopecks: 10000, quantity: 3 }, // 300
        { description: 'B', priceKopecks: 10000, quantity: 1 }, // 100
      ],
      discountKopecks: 10000, // 100 ₽
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(sumKopecks(items)).toBe(30000); // 400 − 100 = 300 ₽
  });

  it('неделимая на единицы скидка → строка дробится на две, сумма точная', () => {
    const items = buildReceiptItems({
      lines: [{ description: 'A', priceKopecks: 10000, quantity: 3 }], // 300
      discountKopecks: 1000, // 10 ₽ → net 290, 290/3 не целое
      deliveryKopecks: 0,
      config: cfg,
    });
    // net = 29000 коп; 3 ед. → 1×9666 + 2×9667 = 29000
    expect(sumKopecks(items)).toBe(29000);
    // все позиции — того же товара A
    expect(items.every((i) => i.description === 'A')).toBe(true);
    expect(items.reduce((s, i) => s + Number(i.quantity), 0)).toBe(3);
  });

  it('инвариант держится на серии комбинаций (скидка+доставка+кратности)', () => {
    const combos = [
      { d: 0, del: 0 },
      { d: 333, del: 15000 },
      { d: 1, del: 0 },
      { d: 9999, del: 50000 },
      { d: 12345, del: 1 },
    ];
    for (const { d, del } of combos) {
      const lines = [
        { description: 'X', priceKopecks: 12300, quantity: 7 },
        { description: 'Y', priceKopecks: 4500, quantity: 3 },
        { description: 'Z', priceKopecks: 99900, quantity: 1 },
      ];
      const gross = lines.reduce((s, l) => s + l.priceKopecks * l.quantity, 0);
      const total = gross - d + del;
      const items = buildReceiptItems({
        lines,
        discountKopecks: d,
        deliveryKopecks: del,
        config: cfg,
      });
      expect(sumKopecks(items)).toBe(total);
    }
  });
});

describe('buildReceiptItems — поля позиции', () => {
  it('measure добавляется только если задан в конфиге (ФФД 1.2)', () => {
    const withMeasure = buildReceiptItems({
      lines: [{ description: 'A', priceKopecks: 100, quantity: 1 }],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: { ...cfg, measure: 'piece' },
    });
    expect(withMeasure[0].measure).toBe('piece');
    const noMeasure = buildReceiptItems({
      lines: [{ description: 'A', priceKopecks: 100, quantity: 1 }],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(noMeasure[0].measure).toBeUndefined();
  });

  it('vat_code и payment_mode проносятся из конфига', () => {
    const items = buildReceiptItems({
      lines: [{ description: 'A', priceKopecks: 100, quantity: 1 }],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: { vatCode: 6, paymentMode: 'full_prepayment' },
    });
    expect(items[0].vat_code).toBe(6);
    expect(items[0].payment_mode).toBe('full_prepayment');
  });

  it('название длиннее 128 символов обрезается (лимит ЮKassa)', () => {
    const long = 'Ж'.repeat(200);
    const items = buildReceiptItems({
      lines: [{ description: long, priceKopecks: 100, quantity: 1 }],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(items[0].description.length).toBe(128);
  });
});

describe('buildReceipt — сборка объекта чека', () => {
  const base = {
    lines: [{ description: 'Мёд', priceKopecks: 25000, quantity: 2 }],
    discountKopecks: 0,
    deliveryKopecks: 30000,
    totalKopecks: 80000,
    config: cfg,
  };

  it('email в приоритете как контакт покупателя', () => {
    const r = buildReceipt({
      ...base,
      customer: { email: 'a@b.ru', phone: '+79990001122' },
    });
    expect(r.customer.email).toBe('a@b.ru');
    expect(r.customer.phone).toBeUndefined();
  });

  it('только телефон → контакт = phone', () => {
    const r = buildReceipt({ ...base, customer: { phone: '+79990001122' } });
    expect(r.customer.phone).toBe('+79990001122');
    expect(r.customer.email).toBeUndefined();
  });

  it('нет ни email, ни телефона → бросает (чек некому отправить)', () => {
    expect(() => buildReceipt({ ...base, customer: {} })).toThrow();
  });

  it('tax_system_code добавляется только если задан', () => {
    expect(buildReceipt({ ...base, customer: { email: 'a@b.ru' } }).tax_system_code).toBeUndefined();
    const withSno = buildReceipt({
      ...base,
      customer: { email: 'a@b.ru' },
      config: { ...cfg, taxSystemCode: 2 },
    });
    expect(withSno.tax_system_code).toBe(2);
  });

  it('защитный инвариант: сумма позиций ≠ totalKopecks → бросает', () => {
    expect(() =>
      buildReceipt({ ...base, totalKopecks: 79999, customer: { email: 'a@b.ru' } }),
    ).toThrow();
  });
});

describe('buildReceiptItems — нулевые строки и eligibility скидки', () => {
  it('строка со 100% скидкой не попадает в чек (нет позиции "0.00", ЮKassa отклонила бы платёж)', () => {
    // товар 100₽×1, скидка 100₽, доставка 300₽ → в чеке только доставка
    const items = buildReceiptItems({
      lines: [{ description: 'A', priceKopecks: 10000, quantity: 1 }],
      discountKopecks: 10000,
      deliveryKopecks: 30000,
      config: cfg,
    });
    expect(items.every((i) => Number(i.amount.value) > 0)).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].payment_subject).toBe('service');
    expect(sumKopecks(items)).toBe(30000);
  });

  it('товар с ценой 0 не даёт позицию "0.00"', () => {
    const items = buildReceiptItems({
      lines: [
        { description: 'Подарок', priceKopecks: 0, quantity: 1 },
        { description: 'Товар', priceKopecks: 10000, quantity: 1 },
      ],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(items.every((i) => Number(i.amount.value) > 0)).toBe(true);
    expect(sumKopecks(items)).toBe(10000);
  });

  it('категорийная скидка применяется ТОЛЬКО к eligible-строкам (иначе неверный фиск. чек)', () => {
    // мёд 1000 (под скидку) + чай 1000 (нет); промокод -20% на мёд = 200₽
    const items = buildReceiptItems({
      lines: [
        { description: 'Мёд', priceKopecks: 100000, quantity: 1, discountEligible: true },
        { description: 'Чай', priceKopecks: 100000, quantity: 1, discountEligible: false },
      ],
      discountKopecks: 20000,
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(items.find((i) => i.description === 'Мёд')!.amount.value).toBe('800.00');
    expect(items.find((i) => i.description === 'Чай')!.amount.value).toBe('1000.00');
    expect(sumKopecks(items)).toBe(180000);
  });
});

describe('buildReceipt — защита от пустого чека', () => {
  it('нет ни одной позиции (всё бесплатно) → бросает, а не шлёт пустой чек', () => {
    expect(() =>
      buildReceipt({
        lines: [{ description: 'A', priceKopecks: 10000, quantity: 1 }],
        discountKopecks: 10000,
        deliveryKopecks: 0,
        totalKopecks: 0,
        customer: { email: 'a@b.ru' },
        config: cfg,
      }),
    ).toThrow();
  });
});

describe('маркировка (Этап 3, шаг 4): разворот строк по единицам с кодами', () => {
  const marked = (over: object = {}) => ({
    description: 'Молоко',
    priceKopecks: 9000,
    quantity: 2,
    isMarked: true,
    markCodes: ['0104600000000001215Qwe', '0104600000000001215Rty'],
    ...over,
  });

  it('маркированная строка 2 шт → 2 позиции по 1 шт, каждая со СВОИМ mark_code_info.gs_1m', () => {
    const items = buildReceiptItems({
      lines: [marked()],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(items).toHaveLength(2);
    for (const it of items) expect(it.quantity).toBe('1');
    expect(items[0].mark_code_info).toEqual({ gs_1m: '0104600000000001215Qwe' });
    expect(items[1].mark_code_info).toEqual({ gs_1m: '0104600000000001215Rty' });
    expect(sumKopecks(items)).toBe(18000);
  });

  it('маркированная позиция всегда несёт measure (обязателен у ЮKassa) и mark_mode=0', () => {
    const items = buildReceiptItems({
      lines: [marked({ quantity: 1, markCodes: ['0104600CODE1'] })],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: cfg, // measure в cfg НЕ задан — для маркированных берётся 'piece'
    });
    expect(items[0].measure).toBe('piece');
    expect(items[0].mark_mode).toBe(0);
  });

  it('скидка на маркированную строку: единицы могут отличаться на копейку, сумма точная', () => {
    // 3 шт по 100₽, скидка 1₽ → 29900 коп на 3 единицы: 9966+9967+9967
    const items = buildReceiptItems({
      lines: [marked({ quantity: 3, priceKopecks: 10000, markCodes: ['C1', 'C2', 'C3'] })],
      discountKopecks: 100,
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(items).toHaveLength(3);
    expect(sumKopecks(items)).toBe(29900);
    // каждый код использован ровно один раз
    expect(items.map((i) => i.mark_code_info!.gs_1m).sort()).toEqual(['C1', 'C2', 'C3']);
  });

  it('немаркированные строки не разворачиваются (как раньше)', () => {
    const items = buildReceiptItems({
      lines: [
        { description: 'Мёд', priceKopecks: 25000, quantity: 2 },
        marked({ quantity: 1, markCodes: ['CODE'] }),
      ],
      discountKopecks: 0,
      deliveryKopecks: 0,
      config: cfg,
    });
    const honey = items.find((i) => i.description === 'Мёд')!;
    expect(honey.quantity).toBe('2');
    expect(honey.mark_code_info).toBeUndefined();
  });

  it('isMarked без кодов → throw (фискализация без полного набора кодов невозможна, ТЗ)', () => {
    expect(() =>
      buildReceiptItems({
        lines: [marked({ markCodes: [] })],
        discountKopecks: 0,
        deliveryKopecks: 0,
        config: cfg,
      }),
    ).toThrow();
    expect(() =>
      buildReceiptItems({
        lines: [marked({ markCodes: undefined })],
        discountKopecks: 0,
        deliveryKopecks: 0,
        config: cfg,
      }),
    ).toThrow();
  });

  it('кодов меньше/больше, чем единиц → throw (каждой единице ровно один код)', () => {
    expect(() =>
      buildReceiptItems({
        lines: [marked({ quantity: 3, markCodes: ['C1', 'C2'] })],
        discountKopecks: 0,
        deliveryKopecks: 0,
        config: cfg,
      }),
    ).toThrow();
    expect(() =>
      buildReceiptItems({
        lines: [marked({ quantity: 1, markCodes: ['C1', 'C2'] })],
        discountKopecks: 0,
        deliveryKopecks: 0,
        config: cfg,
      }),
    ).toThrow();
  });
});

describe('buildPostPaymentReceipt (отложенный чек после сборки, POST /receipts)', () => {
  const base = {
    lines: [
      {
        description: 'Молоко',
        priceKopecks: 9000,
        quantity: 1,
        isMarked: true,
        markCodes: ['0104600CODE1'],
      },
    ],
    discountKopecks: 0,
    deliveryKopecks: 30000,
    totalKopecks: 39000,
    customer: { email: 'a@b.ru' },
    config: cfg,
    paymentId: 'pay_22',
    timezone: 6, // UTC+7 Новосибирск
  };

  it('собирает тело POST /receipts: type/payment_id/settlements cashless на всю сумму/send/timezone', () => {
    const r = buildPostPaymentReceipt(base);
    expect(r.type).toBe('payment');
    expect(r.payment_id).toBe('pay_22');
    expect(r.send).toBe(true);
    expect(r.timezone).toBe(6);
    expect(r.settlements).toEqual([
      { type: 'cashless', amount: { value: '390.00', currency: 'RUB' } },
    ]);
    expect(r.customer.email).toBe('a@b.ru');
    expect(r.items.some((i) => i.mark_code_info)).toBe(true);
  });

  it('инвариант суммы работает и здесь: позиции ≠ totalKopecks → throw', () => {
    expect(() => buildPostPaymentReceipt({ ...base, totalKopecks: 38999 })).toThrow();
  });

  it('timezone не задан → поля нет (не обязателен для немаркированных)', () => {
    const r = buildPostPaymentReceipt({ ...base, timezone: undefined });
    expect('timezone' in r).toBe(false);
  });
});

describe('маркировка — фиксы ревью: нулевые суммы и дубли кодов', () => {
  it('маркированная строка с net<=0 (100% скидка) → THROW, а не молчаливый пропуск кодов', () => {
    // коды отсканированы, но строку съела скидка: чек без кодов = нарушение ЧЗ
    expect(() =>
      buildReceiptItems({
        lines: [
          {
            description: 'Молоко',
            priceKopecks: 9000,
            quantity: 2,
            isMarked: true,
            markCodes: ['C1', 'C2'],
          },
        ],
        discountKopecks: 18000,
        deliveryKopecks: 30000,
        config: cfg,
      }),
    ).toThrow(/маркированн/i);
  });

  it('единица маркированной строки с нулевой суммой → THROW (код бы потерялся)', () => {
    // net=2 коп на 3 единицы → одна единица получила бы 0
    expect(() =>
      buildReceiptItems({
        lines: [
          {
            description: 'Кефир',
            priceKopecks: 100,
            quantity: 3,
            isMarked: true,
            markCodes: ['C1', 'C2', 'C3'],
          },
        ],
        discountKopecks: 298,
        deliveryKopecks: 0,
        config: cfg,
      }),
    ).toThrow();
  });

  it('немаркированная строка с net<=0 — по-прежнему тихо пропускается (поведение шага 3)', () => {
    const items = buildReceiptItems({
      lines: [{ description: 'A', priceKopecks: 10000, quantity: 1 }],
      discountKopecks: 10000,
      deliveryKopecks: 30000,
      config: cfg,
    });
    expect(items).toHaveLength(1);
    expect(items[0].payment_subject).toBe('service');
  });

  it('одинаковый код в РАЗНЫХ строках чека → THROW (глобальный дедуп)', () => {
    expect(() =>
      buildReceiptItems({
        lines: [
          { description: 'Молоко 3.2%', priceKopecks: 9000, quantity: 1, isMarked: true, markCodes: ['SAME'] },
          { description: 'Молоко 2.5%', priceKopecks: 8000, quantity: 1, isMarked: true, markCodes: ['SAME'] },
        ],
        discountKopecks: 0,
        deliveryKopecks: 0,
        config: cfg,
      }),
    ).toThrow(/код/i);
  });
});

describe('фиксы контрольной верификации', () => {
  it('немаркированная строка с net<quantity копеек не даёт позиции "0.00"', () => {
    // net=2 коп на 3 шт: perUnit=0 → нулевые единицы не кладём, сумма та же
    const items = buildReceiptItems({
      lines: [{ description: 'A', priceKopecks: 100, quantity: 3 }],
      discountKopecks: 298,
      deliveryKopecks: 0,
      config: cfg,
    });
    expect(items.every((i) => Number(i.amount.value) > 0)).toBe(true);
    expect(sumKopecks(items)).toBe(2);
  });
});
