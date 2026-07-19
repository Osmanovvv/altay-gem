import { describe, expect, it } from 'bun:test';
import {
  buildMatchKey,
  isMarkedType,
  normalizeName,
  parseProductPush,
  parseReceipt,
  pushAuthorized,
  toKopecks,
} from './parse';

describe('toKopecks', () => {
  it('рубли с плавающей точкой → копейки с округлением', () => {
    expect(toKopecks(123.12)).toBe(12312);
    expect(toKopecks(119)).toBe(11900);
    expect(toKopecks('100.123')).toBe(10012);
  });
  it('мусор и отсутствие значения → null', () => {
    expect(toKopecks(undefined)).toBeNull();
    expect(toKopecks(null)).toBeNull();
    expect(toKopecks('дорого')).toBeNull();
    expect(toKopecks('')).toBeNull(); // не 0!
    expect(toKopecks('  ')).toBeNull();
  });

  it('пустая строка quantity не превращается в 0 (не затирает остаток)', () => {
    const p = parseProductPush({
      uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee00',
      name: 'Мёд',
      quantity: '',
    });
    expect(p!.quantity).toBeNull();
  });
});

describe('buildMatchKey', () => {
  it('приоритет: штрихкод → артикул → нормализованное имя', () => {
    expect(
      buildMatchKey({ barcodes: ['4640018530296'], article: 'A-1', name: 'Сыр' }),
    ).toBe('4640018530296');
    expect(buildMatchKey({ barcodes: [], article: 'A-1', name: 'Сыр' })).toBe('A-1');
    expect(
      buildMatchKey({ barcodes: [], article: null, name: '  Мёд  Алтайский ' }),
    ).toBe('мед алтайский');
  });
  it('нормализация имени: регистр, ё, пробелы', () => {
    expect(normalizeName('Сгущёнка  ГОСТ')).toBe('сгущенка гост');
  });
});

describe('isMarkedType', () => {
  it('маркированные типы — да, NOT_MARKED и NORMAL — нет', () => {
    expect(isMarkedType('DAIRY_MARKED')).toBe(true);
    expect(isMarkedType('WATER_MARKED')).toBe(true);
    expect(isMarkedType('ALCOHOL_NOT_MARKED')).toBe(false);
    expect(isMarkedType('NORMAL')).toBe(false);
  });
});

describe('pushAuthorized', () => {
  it('принимает голый токен и Bearer, отклоняет чужое и пустое', () => {
    expect(pushAuthorized('s3cret', 's3cret')).toBe(true);
    expect(pushAuthorized('Bearer s3cret', 's3cret')).toBe(true);
    expect(pushAuthorized('wrong', 's3cret')).toBe(false);
    expect(pushAuthorized(undefined, 's3cret')).toBe(false);
    expect(pushAuthorized('s3cret', '')).toBe(false); // секрет не настроен
  });
});

describe('parseReceipt', () => {
  const P1 = 'c5f72831-aa24-4e0e-ab81-0c27401c9280';
  const P2 = '01ba18b6-8707-5f47-3d9c-4db058054cb3';
  const P3 = '20170928-9441-4beb-beae-c6bc5e7af30d';
  const S1 = '20170928-3176-40eb-80e2-a11f032e282a';
  const base = {
    uuid: '20170222-D58C-40E0-8051-B53ADFF38860',
    type: 'SELL',
    storeUuid: S1,
  };

  it('camelCase-push: positions в корне, productUuid', () => {
    const r = parseReceipt({
      ...base,
      positions: [{ productUuid: P1, quantity: 2.5 }],
    });
    expect(r).not.toBeNull();
    expect(r!.storeId).toBe(S1);
    expect(r!.positions).toEqual([{ productId: P1, quantity: 2.5 }]);
  });

  it('snake_case-вариант: body.positions и product_id', () => {
    const r = parseReceipt({
      uuid: base.uuid,
      type: 'PAYBACK',
      store_id: S1,
      body: { positions: [{ product_id: P2, quantity: 1 }] },
    });
    expect(r!.type).toBe('PAYBACK');
    expect(r!.storeId).toBe(S1);
    expect(r!.positions[0]).toEqual({ productId: P2, quantity: 1 });
  });

  it('storeUuid внутри body (движение с вложенным storeUuid) — тоже находим', () => {
    const r = parseReceipt({
      uuid: base.uuid,
      type: 'SELL',
      body: { storeUuid: S1, positions: [{ productId: P1, quantity: 2 }] },
    });
    expect(r!.storeId).toBe(S1); // иначе движение осталось бы без магазина
    expect(r!.positions[0]).toEqual({ productId: P1, quantity: 2 });
  });

  it('вариант positionsList тоже принимается', () => {
    const r = parseReceipt({
      ...base,
      positionsList: [{ productId: P3, quantity: 3 }],
    });
    expect(r!.positions[0].productId).toBe(P3);
  });

  it('ноль и нечисло отбрасываются; отрицательное берётся по модулю (знак — у типа)', () => {
    // Эвотор шлёт ЗНАКОВОЕ количество: SELL +, PAYBACK − (подтверждено живым
    // возвратом с прода). Модуль берём здесь, направление даёт documentStockSign.
    const r = parseReceipt({
      ...base,
      positions: [
        { productUuid: P1, quantity: 0 }, //      ноль — нет движения, мимо
        { productUuid: P2, quantity: -1 }, //     возврат: модуль 1, сохраняем
        { productUuid: P3, quantity: 'два' }, //  мусор — мимо
        { quantity: 5 }, //                       без id — мимо
        { productUuid: P1, quantity: 5 }, //       обычная — сохраняем
      ],
    });
    expect(r!.positions).toEqual([
      { productId: P2, quantity: 1 },
      { productId: P1, quantity: 5 },
    ]);
  });

  it('РЕАЛЬНЫЙ PAYBACK с прода: quantity отрицательное → берём по модулю (возврат +остаток)', () => {
    // Живой возврат 15.07: «Мёд подсолнечный», quantity −0.834, measure кг.
    // Раньше парсер отбрасывал его (фильтр quantity>0) → остаток НЕ рос.
    const r = parseReceipt({
      id: '20250716-AAAA-4000-8000-000000000001',
      type: 'ReceiptCreated',
      data: {
        id: '20250716-BBBB-4000-8000-000000000002',
        type: 'PAYBACK',
        storeId: S1,
        items: [{ id: P1, name: 'Мёд', price: 650, quantity: -0.834 }],
      },
    });
    expect(r!.type).toBe('PAYBACK');
    expect(r!.positions).toEqual([{ productId: P1, quantity: 0.834 }]);
  });

  it('кривые id (не UUID) не роняют чек: storeId → null, позиция — мимо', () => {
    const r = parseReceipt({
      uuid: base.uuid,
      type: 'SELL',
      storeUuid: 'магазин-1',
      positions: [
        { productUuid: 'товар-1', quantity: 2 },
        { productUuid: P1, quantity: 1 },
      ],
    });
    expect(r!.storeId).toBeNull();
    expect(r!.positions).toEqual([{ productId: P1, quantity: 1 }]);
  });

  it('«Чеки ver.2» РЕАЛЬНЫЙ конверт: type события ReceiptCreated, документ SELL+data.id в data', () => {
    // Форма подтверждена живым чеком с прод-кассы: наверху id/type СОБЫТИЯ,
    // фискальный документ (его id и тип) — в data. Берём документ.
    const r = parseReceipt({
      id: '20250101-EEEE-4000-8000-000000000009', // id события (конверт)
      type: 'ReceiptCreated', //                     тип СОБЫТИЯ, не документа
      userId: '01-000000000000001',
      version: 1,
      timestamp: 1_700_000_000,
      data: {
        id: '20250101-DDDD-4000-8000-000000000001', // id ДОКУМЕНТА — ключ дедупа
        type: 'SELL', //                               фискальный тип
        storeId: S1,
        dateTime: '2026-07-09T10:00:00.000+0000',
        items: [
          { id: P1, quantity: 2, price: 123.5, name: 'Сыр' },
          { id: P2, quantity: 0.5 },
        ],
      },
    });
    expect(r).not.toBeNull();
    expect(r!.type).toBe('SELL'); // НЕ ReceiptCreated (иначе sign=0, остаток не спишется)
    // uuid = id ДОКУМЕНТА (совпадёт с id из поллинга getDocuments), не id события —
    // иначе дедуп вебхук↔поллинг разъедется и возможно двойное списание.
    expect(r!.uuid).toBe('20250101-DDDD-4000-8000-000000000001');
    expect(r!.storeId).toBe(S1);
    expect(r!.positions).toEqual([
      { productId: P1, quantity: 2 },
      { productId: P2, quantity: 0.5 },
    ]);
  });

  it('«Чеки ver.2» плоская форма: id/type/storeId/items в корне', () => {
    const r = parseReceipt({
      id: '20250101-BBBB-4000-8000-000000000002',
      type: 'PAYBACK',
      storeId: S1,
      items: [{ id: P1, quantity: 1 }],
    });
    expect(r!.type).toBe('PAYBACK');
    expect(r!.positions).toEqual([{ productId: P1, quantity: 1 }]);
  });

  it('нестандартные version/variant-биты Эвотора проходят', () => {
    const r = parseReceipt({
      ...base,
      storeUuid: '20180820-7052-4047-807D-E82C50000000',
      positions: [{ productUuid: P1, quantity: 1 }],
    });
    expect(r!.storeId).toBe('20180820-7052-4047-807D-E82C50000000');
  });

  it('не-чек (нет uuid/type) → null', () => {
    expect(parseReceipt({})).toBeNull();
    expect(parseReceipt('мусор')).toBeNull();
    expect(parseReceipt(null)).toBeNull();
  });
});

describe('parseProductPush', () => {
  it('camelCase-товар из вебхука разбирается полностью', () => {
    const p = parseProductPush({
      uuid: '01ba18b6-8707-5f47-3d9c-4db058054cb2',
      name: 'Сидр',
      group: false,
      parentUuid: '1ddea16b-971b-dee5-3798-1b29a7aa2e27',
      code: '6',
      barCodes: ['2000000000060'],
      price: 123.12,
      costPrice: 100.123,
      quantity: 12,
      tax: 'VAT_18',
      type: 'ALCOHOL_NOT_MARKED',
      allowToSell: true,
    });
    expect(p).not.toBeNull();
    expect(p!.priceKopecks).toBe(12312);
    expect(p!.costPriceKopecks).toBe(10012);
    expect(p!.quantity).toBe(12);
    expect(p!.barcodes).toEqual(['2000000000060']);
    expect(p!.isMarked).toBe(false);
    expect(p!.group).toBe(false);
    expect(buildMatchKey(p!)).toBe('2000000000060');
  });

  it('частичный push: отсутствующие поля → null (не затирать реплику)', () => {
    const p = parseProductPush({
      uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee01',
      name: 'Мёд',
    });
    expect(p!.priceKopecks).toBeNull();
    expect(p!.quantity).toBeNull();
    expect(p!.measure).toBeNull();
    expect(p!.allowToSell).toBeNull();
    expect(p!.removed).toBe(false);
  });

  it('группа помечается, snake_case-поля принимаются', () => {
    const p = parseProductPush({
      uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee02',
      name: 'Сыры',
      group: true,
      parent_id: '1ddea16b-971b-dee5-3798-1b29a7aa2e27',
      barcodes: ['123'],
      measure_name: 'кг',
      allow_to_sell: false,
    });
    expect(p!.group).toBe(true);
    expect(p!.parentUuid).toBe('1ddea16b-971b-dee5-3798-1b29a7aa2e27');
    expect(p!.barcodes).toEqual(['123']);
    expect(p!.measure).toBe('кг');
    expect(p!.allowToSell).toBe(false);
  });

  it('без uuid/имени или с кривым uuid → null (uuid-колонки в БД)', () => {
    expect(parseProductPush({ name: 'без uuid' })).toBeNull();
    expect(parseProductPush({ uuid: 'u-1', name: 'кривой uuid' })).toBeNull();
    expect(
      parseProductPush({
        uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee03',
      }),
    ).toBeNull();
  });

  it('кривой parentUuid деградирует в null, товар не теряется', () => {
    const p = parseProductPush({
      uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee04',
      name: 'Товар',
      parentUuid: 'root',
    });
    expect(p).not.toBeNull();
    expect(p!.parentUuid).toBeNull();
  });
});
