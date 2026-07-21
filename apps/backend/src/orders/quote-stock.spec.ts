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

  test('доставка: проверяется магазин записи товара, otherPickup не предлагается', async () => {
    const svc = service(stores);
    const calls: string[] = [];
    (
      svc as unknown as {
        storeOrderable: (p: never, s: string) => Promise<number>;
      }
    ).storeOrderable = (_p, storeId) => {
      calls.push(storeId);
      return Promise.resolve(0);
    };
    const problems = await (
      svc as unknown as {
        quoteStockProblems: (m: string, l: unknown[]) => Promise<unknown[]>;
      }
    ).quoteStockProblems('courier_nsk', [{ p: P('syr', 'len'), quantity: 2 }]);
    expect(calls).toEqual(['len']); // склад по умолчанию = магазин записи
    expect(problems).toEqual([{ id: 'syr', availableQty: 0 }]);
  });
});
