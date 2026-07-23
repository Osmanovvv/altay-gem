import { describe, expect, test } from 'bun:test';
import { OrdersService } from './orders.service';

/**
 * Тесты мягкой предпроверки остатков в quote (недочёт #5 ТЗ / #37).
 * Сервис собирается без Nest-контейнера (Object.create): проверяем логику
 * quoteStockProblems, а математику storeOrderable подменяем — она отдельно
 * покрыта в stock.spec.ts (orderableUnits).
 */
function service(stores: Array<{ id: string; address: string | null }>) {
  const svc = Object.create(OrdersService.prototype) as OrdersService & {
    db: unknown;
    safetyBuffer: number;
  };
  (svc as unknown as { db: unknown }).db = {
    select: () => ({ from: () => Promise.resolve(stores) }),
  };
  (svc as unknown as { safetyBuffer: number }).safetyBuffer = 1;
  return svc;
}

const P = (slug: string, storeId: string) =>
  ({
    slug,
    storeId,
    matchKey: 'mk-' + slug,
    measure: 'шт',
    portionMassG: null,
  }) as never;

describe('quoteStockProblems', () => {
  const stores = [
    { id: 'len', address: 'ул. Ленинградская 75/2' },
    { id: 'tit', address: 'ул. Титова 32' },
  ];

  test('самовывоз: нехватка в точке + другая точка покрывает → otherPickup', async () => {
    const svc = service(stores);
    const avail: Record<string, number> = { len: 5, tit: 1 };
    (
      svc as unknown as {
        storeOrderable: (p: never, s: string) => Promise<number>;
      }
    ).storeOrderable = (_p, storeId) => Promise.resolve(avail[storeId] ?? 0);
    const problems = await (
      svc as unknown as {
        quoteStockProblems: (m: string, l: unknown[]) => Promise<unknown[]>;
      }
    ).quoteStockProblems('pickup_titova', [{ p: P('syr', 'len'), quantity: 3 }]);
    expect(problems).toEqual([
      {
        id: 'syr',
        availableQty: 1,
        otherPickup: { point: 'pickup_leningradskaya', availableQty: 5 },
      },
    ]);
  });

  test('самовывоз: другая точка НЕ покрывает → без otherPickup', async () => {
    const svc = service(stores);
    const avail: Record<string, number> = { len: 2, tit: 1 };
    (
      svc as unknown as {
        storeOrderable: (p: never, s: string) => Promise<number>;
      }
    ).storeOrderable = (_p, storeId) => Promise.resolve(avail[storeId] ?? 0);
    const problems = await (
      svc as unknown as {
        quoteStockProblems: (m: string, l: unknown[]) => Promise<unknown[]>;
      }
    ).quoteStockProblems('pickup_titova', [{ p: P('syr', 'len'), quantity: 3 }]);
    expect(problems).toEqual([{ id: 'syr', availableQty: 1 }]);
  });

  test('хватает → пусто', async () => {
    const svc = service(stores);
    (
      svc as unknown as {
        storeOrderable: (p: never, s: string) => Promise<number>;
      }
    ).storeOrderable = () => Promise.resolve(10);
    const problems = await (
      svc as unknown as {
        quoteStockProblems: (m: string, l: unknown[]) => Promise<unknown[]>;
      }
    ).quoteStockProblems('pickup_titova', [{ p: P('syr', 'len'), quantity: 3 }]);
    expect(problems).toEqual([]);
  });

  test('доставка: агрегат по магазинам меньше заказа → проблема с суммой', async () => {
    // Курьер собирают из любых точек: доступно = сумма (5+0), quantity 6 → нехватка.
    const svc = service(stores);
    const avail: Record<string, number> = { len: 5, tit: 0 };
    (
      svc as unknown as {
        storeOrderable: (p: never, s: string) => Promise<number>;
      }
    ).storeOrderable = (_p, storeId) => Promise.resolve(avail[storeId] ?? 0);
    const problems = await (
      svc as unknown as {
        quoteStockProblems: (m: string, l: unknown[]) => Promise<unknown[]>;
      }
    ).quoteStockProblems('courier_nsk', [{ p: P('syr', 'len'), quantity: 6 }]);
    expect(problems).toEqual([{ id: 'syr', availableQty: 5 }]);
  });

  test('БАГФИКС доставка: весь остаток в НЕ-записанном магазине → курьер доступен', async () => {
    // Сыр «Хит»: 22 на Ленинградской, 0 на Титова, магазин записи = tit.
    // Раньше курьер смотрел на tit (0) и блокировал заказ. Теперь — агрегат 22.
    const svc = service(stores);
    const avail: Record<string, number> = { len: 22, tit: 0 };
    (
      svc as unknown as {
        storeOrderable: (p: never, s: string) => Promise<number>;
      }
    ).storeOrderable = (_p, storeId) => Promise.resolve(avail[storeId] ?? 0);
    const problems = await (
      svc as unknown as {
        quoteStockProblems: (m: string, l: unknown[]) => Promise<unknown[]>;
      }
    ).quoteStockProblems('courier_nsk', [{ p: P('syr', 'tit'), quantity: 1 }]);
    expect(problems).toEqual([]); // магазин записи не важен — считаем сумму
  });

  test('доставка: otherPickup не предлагается (это подсказка только для самовывоза)', async () => {
    const svc = service(stores);
    const avail: Record<string, number> = { len: 0, tit: 0 };
    (
      svc as unknown as {
        storeOrderable: (p: never, s: string) => Promise<number>;
      }
    ).storeOrderable = (_p, storeId) => Promise.resolve(avail[storeId] ?? 0);
    const problems = await (
      svc as unknown as {
        quoteStockProblems: (m: string, l: unknown[]) => Promise<unknown[]>;
      }
    ).quoteStockProblems('courier_nsk', [{ p: P('syr', 'len'), quantity: 2 }]);
    expect(problems).toEqual([{ id: 'syr', availableQty: 0 }]); // без otherPickup
  });
});

/**
 * quoteDelivery-уровень: слияние дублей до предпроверки (как в create) и
 * контракт ответа — stockProblems присутствует ТОЛЬКО при непустом списке.
 * Внешние зависимости (каталог/тарифы/предпроверка) подменяются целиком.
 */
describe('quoteDelivery: дубли и контракт stockProblems', () => {
  const internalProduct = {
    slug: 'syr',
    storeId: 'len',
    matchKey: 'mk-syr',
    measure: 'шт',
    portionMassG: null,
    deliveryWeightG: 500,
    isPerishable: false,
    priceRub: 100,
    name: 'Сыр',
    categorySlug: null,
    isMarked: false,
  };

  function quoteService(problems: unknown[]) {
    const svc = Object.create(OrdersService.prototype) as OrdersService;
    const captured: { lines?: Array<{ quantity: number }> } = {};
    Object.assign(svc as unknown as Record<string, unknown>, {
      catalog: {
        internalBySlug: () =>
          Promise.resolve(new Map([['syr', internalProduct]])),
        unitWeightG: () => 500,
      },
      strapi: { deliveryTariffs: () => Promise.resolve({}) },
      quoteStockProblems: (_m: string, lines: Array<{ quantity: number }>) => {
        captured.lines = lines;
        return Promise.resolve(problems);
      },
    });
    return { svc, captured };
  }

  test('дубли slug сливаются ДО предпроверки (как в create)', async () => {
    const { svc, captured } = quoteService([]);
    const r = await svc.quoteDelivery({
      deliveryMethod: 'pickup_leningradskaya',
      items: [
        { id: 'syr', quantity: 3 },
        { id: 'syr', quantity: 3 },
      ],
    });
    // предпроверка видит ОДНУ слитую строку, суммы не меняются
    expect(captured.lines?.map((l) => l.quantity)).toEqual([6]);
    expect(r.subtotalRub).toBe(600);
  });

  test('есть проблемы → stockProblems в ответе', async () => {
    const problem = { id: 'syr', availableQty: 1 };
    const { svc } = quoteService([problem]);
    const r = await svc.quoteDelivery({
      deliveryMethod: 'pickup_leningradskaya',
      items: [{ id: 'syr', quantity: 3 }],
    });
    expect(
      (r as { stockProblems?: unknown[] }).stockProblems,
    ).toEqual([problem]);
  });

  test('проблем нет → ключа stockProblems нет вовсе', async () => {
    const { svc } = quoteService([]);
    const r = await svc.quoteDelivery({
      deliveryMethod: 'pickup_leningradskaya',
      items: [{ id: 'syr', quantity: 1 }],
    });
    expect('stockProblems' in r).toBe(false);
  });
});
