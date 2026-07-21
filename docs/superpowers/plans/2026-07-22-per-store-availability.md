# По-магазинное наличие (задача #37) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Витрина и чекаут честно показывают наличие по каждой точке самовывоза; агрегат = сумма по-магазинных буферизованных значений; quote-эндпоинт заранее отбивает нехватку в выбранной точке.

**Architecture:** Общий маппинг «точка → магазин» (`pickup-points.ts`) + общая чистая математика остатка (`orderableUnits` в `catalog/stock.ts`) используются тремя потребителями: каталогом (карточка/деталь), `create()` (без изменения поведения) и `quoteDelivery()` (новая мягкая предпроверка). Фронт: блок разбивки на странице товара + предупреждение и гейт на шаге 1 чекаута.

**Tech Stack:** NestJS + Drizzle (bun test), TanStack Start/React. Тесты бэка: `bun test` из `apps/backend`. Сборки: `bun run build` (backend: `nest build`), фронт `bun run build` (vite) + отдельный `./node_modules/.bin/tsc --noEmit` (НЕ `npx tsc`!).

**Spec:** `docs/superpowers/specs/2026-07-22-per-store-availability-design.md`

**Рабочая директория:** `C:\kipu\learn\Claude projects\Жемчужина Алтая\altay-gem`

⚠️ Все команды bun гонять из `apps/backend` или `apps/frontend`. Коммиты после каждой задачи. Windows: фронт-eslint показывает шумовые CRLF-ошибки «Delete ␍» — НЕ чинить массово, это не регрессия.

---

### Task 1: Модуль точек самовывоза (pickup-points.ts)

**Files:**
- Create: `apps/backend/src/orders/pickup-points.ts`
- Test: `apps/backend/src/orders/pickup-points.spec.ts`
- Modify: `apps/backend/src/orders/orders.service.ts` (убрать локальный `PICKUP_STORE_HINT` ~строка 84, переписать `resolveTargetStore` ~строка 752)

- [ ] **Step 1: Написать падающий тест**

`apps/backend/src/orders/pickup-points.spec.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  isPickupPoint,
  PICKUP_POINTS,
  resolvePickupStores,
} from './pickup-points';

describe('pickup-points', () => {
  const stores = [
    { id: 'store-len', address: 'г. Новосибирск, ул. Ленинградская 75/2' },
    { id: 'store-tit', address: 'г. Новосибирск, ул. Титова 32' },
  ];

  test('резолвит обе точки по подстроке адреса', () => {
    expect(resolvePickupStores(stores)).toEqual([
      { point: 'pickup_leningradskaya', storeId: 'store-len' },
      { point: 'pickup_titova', storeId: 'store-tit' },
    ]);
  });

  test('пропускает точку без магазина (не бросает)', () => {
    expect(resolvePickupStores([stores[0]])).toEqual([
      { point: 'pickup_leningradskaya', storeId: 'store-len' },
    ]);
  });

  test('null-адрес не матчится и не роняет', () => {
    expect(resolvePickupStores([{ id: 'x', address: null }])).toEqual([]);
  });

  test('isPickupPoint отличает самовывоз от доставки', () => {
    expect(isPickupPoint('pickup_titova')).toBe(true);
    expect(isPickupPoint('courier_nsk')).toBe(false);
    expect(isPickupPoint('russia')).toBe(false);
  });

  test('PICKUP_POINTS перечисляет обе точки', () => {
    expect(PICKUP_POINTS).toEqual(['pickup_leningradskaya', 'pickup_titova']);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd apps/backend && bun test pickup-points`
Expected: FAIL — «Cannot find module './pickup-points'».

- [ ] **Step 3: Минимальная реализация**

`apps/backend/src/orders/pickup-points.ts`:

```ts
/**
 * Точки самовывоза и их сопоставление магазинам Эвотора (по подстроке адреса
 * из справочника evotor_stores). Единственный источник этого маппинга —
 * используют и заказы (целевой магазин списания), и каталог (разбивка
 * наличия по точкам на витрине).
 */

export type PickupPoint = 'pickup_leningradskaya' | 'pickup_titova';

export const PICKUP_STORE_HINT: Record<PickupPoint, string> = {
  pickup_leningradskaya: 'Ленинградская',
  pickup_titova: 'Титова',
};

export const PICKUP_POINTS = Object.keys(PICKUP_STORE_HINT) as PickupPoint[];

export function isPickupPoint(method: string): method is PickupPoint {
  return method in PICKUP_STORE_HINT;
}

/** Какому магазину Эвотора соответствует каждая точка самовывоза. */
export function resolvePickupStores(
  stores: Array<{ id: string; address: string | null }>,
): Array<{ point: PickupPoint; storeId: string }> {
  const out: Array<{ point: PickupPoint; storeId: string }> = [];
  for (const point of PICKUP_POINTS) {
    const hint = PICKUP_STORE_HINT[point];
    const store = stores.find((s) => (s.address ?? '').includes(hint));
    if (store) out.push({ point, storeId: store.id });
  }
  return out;
}
```

- [ ] **Step 4: Тест зелёный**

Run: `cd apps/backend && bun test pickup-points`
Expected: PASS (5 тестов).

- [ ] **Step 5: Перевести orders.service на модуль (поведение не меняется)**

В `apps/backend/src/orders/orders.service.ts`:

Удалить локальную константу (~строка 84):

```ts
const PICKUP_STORE_HINT: Record<string, string> = {
  pickup_leningradskaya: 'Ленинградская',
  pickup_titova: 'Титова',
};
```

Добавить импорт рядом с остальными импортами './...':

```ts
import {
  isPickupPoint,
  resolvePickupStores,
} from './pickup-points';
```

Переписать `resolveTargetStore` (~строка 752), поведение 1:1 (включая `PICKUP_POINT_UNKNOWN`):

```ts
  private async resolveTargetStore(
    method: DeliveryMethod,
  ): Promise<string | null> {
    if (!isPickupPoint(method)) return null; // доставка — магазин записи товара
    const stores = await this.db.select().from(evotorStores);
    const match = resolvePickupStores(stores).find((m) => m.point === method);
    if (!match) {
      throw new BadRequestException({
        code: 'PICKUP_POINT_UNKNOWN',
        message: 'Точка самовывоза не настроена',
      });
    }
    return match.storeId;
  }
```

- [ ] **Step 6: Все тесты бэка зелёные**

Run: `cd apps/backend && bun test`
Expected: PASS, столько же тестов + 5 новых, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/orders/pickup-points.ts apps/backend/src/orders/pickup-points.spec.ts apps/backend/src/orders/orders.service.ts
git commit -m "refactor(orders): точки самовывоза вынесены в общий модуль pickup-points"
```

---

### Task 2: Чистая функция orderableUnits + рефактор create()

**Files:**
- Modify: `apps/backend/src/catalog/stock.ts` (добавить `orderableUnits`)
- Test: `apps/backend/src/catalog/stock.spec.ts` (дописать describe)
- Modify: `apps/backend/src/orders/orders.service.ts:453-460` (create(): заменить ручную математику на `orderableUnits`)

- [ ] **Step 1: Написать падающие тесты**

Дописать в `apps/backend/src/catalog/stock.spec.ts`:

```ts
import { orderableUnits } from './stock'; // добавить к существующему импорту

describe('orderableUnits', () => {
  test('штучный: floor и буфер', () => {
    expect(
      orderableUnits({ availableQty: 5, measure: 'шт', portionMassG: null, buffer: 1 }),
    ).toBe(4);
  });

  test('весовой: порции считаются floor-ом ДО буфера', () => {
    // 0.95 кг при порции 1000 г = 0 порций (заказать порцию нельзя)
    expect(
      orderableUnits({ availableQty: 0.95, measure: 'кг', portionMassG: 1000, buffer: 0 }),
    ).toBe(0);
    // 1.892 кг / 100 г = 18 порций, буфер 1 → 17 (живой кейс «Сыр Граф»)
    expect(
      orderableUnits({ availableQty: 1.892, measure: 'кг', portionMassG: 100, buffer: 1 }),
    ).toBe(17);
  });

  test('отрицательный/нулевой остаток → 0, не отрицательное', () => {
    expect(
      orderableUnits({ availableQty: -2, measure: 'шт', portionMassG: null, buffer: 1 }),
    ).toBe(0);
    expect(
      orderableUnits({ availableQty: 0, measure: 'шт', portionMassG: null, buffer: 0 }),
    ).toBe(0);
  });

  test('битая масса порции (0/null) не даёт Infinity — дефолт 100 г', () => {
    expect(
      orderableUnits({ availableQty: 1, measure: 'кг', portionMassG: 0, buffer: 0 }),
    ).toBe(10);
  });

  test('буфер больше остатка → 0', () => {
    expect(
      orderableUnits({ availableQty: 2, measure: 'шт', portionMassG: null, buffer: 5 }),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `cd apps/backend && bun test stock`
Expected: FAIL — «orderableUnits is not exported» (или not a function).

- [ ] **Step 3: Реализация**

Дописать в конец `apps/backend/src/catalog/stock.ts`:

```ts
/**
 * Доступно к ЗАКАЗУ в единицах продажи (штуки или порции): floor по порциям
 * ДО буфера, буфер по-магазинно. Единственный источник этой математики —
 * используют витрина (карточка/разбивка по точкам), create() и quote:
 * расхождение «показали 4, а заказать можно 2» исключается конструктивно.
 */
export function orderableUnits(input: {
  /** Физостаток минус активные резервы, в шт или кг. */
  availableQty: number;
  measure: string;
  portionMassG: number | null | undefined;
  buffer: number;
}): number {
  const isWeight = input.measure === 'кг';
  const raw = isWeight
    ? Math.floor(input.availableQty / (safePortionMassG(input.portionMassG) / 1000))
    : Math.floor(input.availableQty);
  return applyStockBuffer(raw, input.buffer);
}
```

- [ ] **Step 4: Тест зелёный**

Run: `cd apps/backend && bun test stock`
Expected: PASS.

- [ ] **Step 5: create() переводится на orderableUnits (поведение 1:1)**

В `apps/backend/src/orders/orders.service.ts` внутри транзакции create() найти блок (~строки 453-460):

```ts
        const availableUnits = physical - Number(resRow?.reserved ?? 0);
        const isWeight = String(row.measure) === 'кг';
        const portionKg = safePortionMassG(p.portionMassG) / 1000;
        const rawQty = isWeight
          ? Math.floor(availableUnits / portionKg)
          : Math.floor(availableUnits);
        // Тот же буфер, что и на витрине: придержанный экземпляр заказать нельзя.
        const availableQty = applyStockBuffer(rawQty, this.safetyBuffer);
```

Заменить на (`isWeight`/`portionKg` НУЖНЫ ниже для пересчёта резерва — оставить):

```ts
        const availableUnits = physical - Number(resRow?.reserved ?? 0);
        const isWeight = String(row.measure) === 'кг';
        const portionKg = safePortionMassG(p.portionMassG) / 1000;
        // Та же математика, что на витрине и в quote (единый источник).
        const availableQty = orderableUnits({
          availableQty: availableUnits,
          measure: String(row.measure),
          portionMassG: p.portionMassG,
          buffer: this.safetyBuffer,
        });
```

Импорт в orders.service.ts: к существующему `import { applyStockBuffer, safePortionMassG } from '../catalog/stock';` добавить `orderableUnits` (если `applyStockBuffer` больше нигде в файле не используется — убрать его из импорта).

- [ ] **Step 6: Все тесты зелёные (поведение create не изменилось)**

Run: `cd apps/backend && bun test`
Expected: PASS, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/catalog/stock.ts apps/backend/src/catalog/stock.spec.ts apps/backend/src/orders/orders.service.ts
git commit -m "refactor(stock): orderableUnits — единая математика доступного к заказу"
```

---

### Task 3: Каталог — честный агрегат + pickupAvailability

**Files:**
- Modify: `apps/backend/src/catalog/catalog.service.ts` (ProductCard, buildAll, toCard)
- Test: `apps/backend/src/catalog/catalog-availability.spec.ts` (новый, чистая функция агрегации)

Существующая агрегация: `qtyByMatchKey` суммирует кг/шт по магазинам, `toCard` применяет порции+буфер К СУММЕ. Новая: по-магазинно порции+буфер, агрегат = сумма, плюс разбивка по точкам.

- [ ] **Step 1: Падающий тест на чистую функцию агрегации**

`apps/backend/src/catalog/catalog-availability.spec.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { perStoreAvailability } from './catalog-availability';

describe('perStoreAvailability', () => {
  const pickupStores = [
    { point: 'pickup_leningradskaya' as const, storeId: 'len' },
    { point: 'pickup_titova' as const, storeId: 'tit' },
  ];

  test('штучный в двух магазинах: агрегат = сумма буферизованных', () => {
    const r = perStoreAvailability({
      perStoreQty: [
        { storeId: 'len', qty: 3 },
        { storeId: 'tit', qty: 2 },
      ],
      measure: 'шт',
      portionMassG: null,
      buffer: 1,
      pickupStores,
    });
    // Лен 3−1=2, Тит 2−1=1 → агрегат 3 (а не 4, как при буфере-на-сумму)
    expect(r.totalUnits).toBe(3);
    expect(r.pickupAvailability).toEqual([
      { point: 'pickup_leningradskaya', availableQty: 2 },
      { point: 'pickup_titova', availableQty: 1 },
    ]);
  });

  test('товар только в одном магазине: вторая точка 0', () => {
    const r = perStoreAvailability({
      perStoreQty: [{ storeId: 'len', qty: 5 }],
      measure: 'шт',
      portionMassG: null,
      buffer: 1,
      pickupStores,
    });
    expect(r.totalUnits).toBe(4);
    expect(r.pickupAvailability).toEqual([
      { point: 'pickup_leningradskaya', availableQty: 4 },
      { point: 'pickup_titova', availableQty: 0 },
    ]);
  });

  test('весовой: floor порций ПО КАЖДОМУ магазину до буфера', () => {
    const r = perStoreAvailability({
      perStoreQty: [
        { storeId: 'len', qty: 0.95 },
        { storeId: 'tit', qty: 0.95 },
      ],
      measure: 'кг',
      portionMassG: 1000,
      buffer: 0,
      pickupStores,
    });
    // По 0.95 кг при порции 1 кг: из КАЖДОЙ точки 0 порций → агрегат 0
    // (старая математика на сумме 1.9 кг показала бы 1 — недостижимую)
    expect(r.totalUnits).toBe(0);
  });

  test('магазин не-точка входит в агрегат, но не в разбивку', () => {
    const r = perStoreAvailability({
      perStoreQty: [
        { storeId: 'len', qty: 3 },
        { storeId: 'warehouse', qty: 10 },
      ],
      measure: 'шт',
      portionMassG: null,
      buffer: 1,
      pickupStores,
    });
    expect(r.totalUnits).toBe(2 + 9);
    expect(r.pickupAvailability).toEqual([
      { point: 'pickup_leningradskaya', availableQty: 2 },
      { point: 'pickup_titova', availableQty: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `cd apps/backend && bun test catalog-availability`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация чистой функции**

Create `apps/backend/src/catalog/catalog-availability.ts`:

```ts
import type { PickupPoint } from '../orders/pickup-points';
import { orderableUnits } from './stock';

/**
 * По-магазинная доступность товара (недочёт #5 ТЗ / #37).
 * Буфер и порции применяются ПО КАЖДОМУ магазину (как при заказе), агрегат =
 * сумма: витрина не обещает количество, недостижимое ни из одной точки.
 * Агрегат — по ВСЕМ магазинам (ТЗ:266), разбивка — только по точкам самовывоза.
 */
export function perStoreAvailability(input: {
  /** Кг/шт по магазинам, резервы уже вычтены (может быть отрицательным). */
  perStoreQty: Array<{ storeId: string; qty: number }>;
  measure: string;
  portionMassG: number | null | undefined;
  buffer: number;
  pickupStores: Array<{ point: PickupPoint; storeId: string }>;
}): {
  totalUnits: number;
  pickupAvailability: Array<{ point: PickupPoint; availableQty: number }>;
} {
  const unitsByStore = new Map<string, number>();
  for (const { storeId, qty } of input.perStoreQty) {
    unitsByStore.set(
      storeId,
      orderableUnits({
        availableQty: qty,
        measure: input.measure,
        portionMassG: input.portionMassG,
        buffer: input.buffer,
      }),
    );
  }
  const totalUnits = [...unitsByStore.values()].reduce((s, v) => s + v, 0);
  const pickupAvailability = input.pickupStores.map(({ point, storeId }) => ({
    point,
    availableQty: unitsByStore.get(storeId) ?? 0,
  }));
  return { totalUnits, pickupAvailability };
}
```

- [ ] **Step 4: Тест зелёный**

Run: `cd apps/backend && bun test catalog-availability`
Expected: PASS (4 теста).

- [ ] **Step 5: Провязать в catalog.service**

В `apps/backend/src/catalog/catalog.service.ts`:

5a. Импорты:

```ts
import { perStoreAvailability } from './catalog-availability';
import { resolvePickupStores } from '../orders/pickup-points';
import type { PickupPoint } from '../orders/pickup-points';
import { evotorProducts, evotorStores, stockReservations } from '../db/schema';
```

5b. В `ProductCard` после `availableQty: number;` добавить:

```ts
  /** Доступно в каждой точке самовывоза (буферизовано, в единицах продажи). */
  pickupAvailability: Array<{ point: PickupPoint; availableQty: number }>;
```

5c. Кэш-ключ: `const CACHE_KEY = 'catalog:enriched:v2';` (форма карточки изменилась — не читать старый кэш).

5d. В `buildAll()` добавить выборку магазинов в `Promise.all` (четвёртым элементом):

```ts
    const [strapiProducts, replica, reserved, stores] = await Promise.all([
      this.strapi.products(),
      /* ...два существующих запроса без изменений... */,
      this.db
        .select({ id: evotorStores.id, address: evotorStores.address })
        .from(evotorStores),
    ]);
    const pickupStores = resolvePickupStores(stores);
```

5e. Заменить агрегацию `qtyByMatchKey` (строки ~162-172) на по-магазинную:

```ts
    const byUuid = new Map<string, ReplicaRow & { isMarked: boolean }>();
    // matchKey → [{storeId, qty}] — остаток за вычетом резервов ПО МАГАЗИНАМ
    const qtyByMatchKey = new Map<string, Array<{ storeId: string; qty: number }>>();
    for (const row of replica) {
      byUuid.set(row.evotorUuid, row);
      const available =
        Number(row.quantity) -
        (reservedByKey.get(`${row.storeId}|${row.evotorUuid}`) ?? 0);
      const list = qtyByMatchKey.get(row.matchKey) ?? [];
      list.push({ storeId: row.storeId, qty: Math.max(available, 0) });
      qtyByMatchKey.set(row.matchKey, list);
    }
```

5f. Вызов toCard (строка ~184): `const card = this.toCard(sp, rep, qtyByMatchKey.get(rep.matchKey) ?? [], pickupStores);`

5g. `toCard` — новая сигнатура и расчёт (заменить блок `rawAvailable`/`availableQty`):

```ts
  private toCard(
    sp: StrapiProduct,
    rep: ReplicaRow,
    perStoreQty: Array<{ storeId: string; qty: number }>,
    pickupStores: Array<{ point: PickupPoint; storeId: string }>,
  ): ProductCard {
    const isWeight = rep.measure === 'кг';
    const portionG = safePortionMassG(sp.portionMassG);
    const priceRub = isWeight
      ? Math.round((rep.priceKopecks / 100) * (portionG / 1000))
      : Math.round(rep.priceKopecks / 100);
    // По-магазинно (порции+буфер на точку), агрегат = сумма — как при заказе.
    const { totalUnits: availableQty, pickupAvailability } =
      perStoreAvailability({
        perStoreQty,
        measure: rep.measure,
        portionMassG: sp.portionMassG,
        buffer: this.safetyBuffer,
        pickupStores,
      });
```

и в возвращаемом объекте после `availableQty,` добавить `pickupAvailability,`.
Если `applyStockBuffer` в catalog.service больше не используется — убрать из импорта (`safePortionMassG` остаётся).

- [ ] **Step 6: Все тесты зелёные, обновить сломанные ожидания**

Run: `cd apps/backend && bun test`
Ожидаемо могут упасть тесты, фиксировавшие СТАРЫЙ агрегат (буфер-на-сумму) для мульти-магазинных фикстур — обновить ожидания на новую математику (для ОДНОГО магазина числа не меняются). Ничего не «подгонять» в продовом коде.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/catalog
git commit -m "feat(catalog): по-магазинное наличие — честный агрегат + pickupAvailability (#37)"
```

---

### Task 4: quote — мягкая предпроверка остатка по целевому магазину

**Files:**
- Modify: `apps/backend/src/orders/orders.service.ts` (quoteDelivery ~строка 674 + два новых private-метода)
- Test: `apps/backend/src/orders/quote-stock.spec.ts` (новый)

- [ ] **Step 1: Падающий тест чистой логики выбора «другой точки»**

Логика «предлагать другую точку» — чистая, выносится в pickup-points. Дописать в `apps/backend/src/orders/pickup-points.spec.ts`:

```ts
import { otherPickupPoint } from './pickup-points'; // добавить к импорту

describe('otherPickupPoint', () => {
  const resolved = [
    { point: 'pickup_leningradskaya' as const, storeId: 'len' },
    { point: 'pickup_titova' as const, storeId: 'tit' },
  ];
  test('для точки возвращает вторую', () => {
    expect(otherPickupPoint('pickup_titova', resolved)).toEqual({
      point: 'pickup_leningradskaya',
      storeId: 'len',
    });
  });
  test('если вторая не настроена — null', () => {
    expect(otherPickupPoint('pickup_titova', [resolved[1]])).toBeNull();
  });
});
```

- [ ] **Step 2: Падает**

Run: `cd apps/backend && bun test pickup-points`
Expected: FAIL — otherPickupPoint не экспортирован.

- [ ] **Step 3: Реализация**

Дописать в `apps/backend/src/orders/pickup-points.ts`:

```ts
/** Другая (не выбранная) точка самовывоза, если она настроена. */
export function otherPickupPoint(
  current: PickupPoint,
  resolved: Array<{ point: PickupPoint; storeId: string }>,
): { point: PickupPoint; storeId: string } | null {
  return resolved.find((r) => r.point !== current) ?? null;
}
```

Run: `cd apps/backend && bun test pickup-points` → PASS.

- [ ] **Step 4: Провязать предпроверку в quoteDelivery**

В `apps/backend/src/orders/orders.service.ts`:

4a. Импорты: к импорту из './pickup-points' добавить `otherPickupPoint` и `type PickupPoint`. Тип рядом с другими верхнеуровневыми типами файла:

```ts
type QuoteStockProblem = {
  id: string;
  availableQty: number;
  otherPickup?: { point: PickupPoint; availableQty: number };
};
```

4b. Два private-метода (после `resolveTargetStore`):

```ts
  /**
   * Доступно к заказу в конкретном магазине (шт/порции) — та же математика,
   * что в create(), но обычным SELECT без блокировок (для предпроверки quote).
   */
  private async storeOrderable(
    p: ProductInternal,
    storeId: string,
  ): Promise<number> {
    const rows = await this.db.execute(sql`
      SELECT evotor_uuid, quantity, measure
      FROM evotor_products
      WHERE match_key = ${p.matchKey}
        AND store_id = ${storeId}
        AND is_archived = false AND allow_to_sell = true
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> })
      .rows[0];
    if (!row) return 0;
    const [resRow] = (
      (await this.db.execute(sql`
        SELECT coalesce(sum(quantity), 0) AS reserved
        FROM stock_reservations
        WHERE store_id = ${storeId}
          AND evotor_uuid = ${String(row.evotor_uuid)}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
      `)) as unknown as { rows: Array<{ reserved: string }> }
    ).rows;
    return orderableUnits({
      availableQty: Number(row.quantity) - Number(resRow?.reserved ?? 0),
      measure: String(row.measure),
      portionMassG: p.portionMassG,
      buffer: this.safetyBuffer,
    });
  }

  /**
   * Мягкая предпроверка корзины против целевого магазина выбранного способа
   * (недочёт #5 ТЗ): самовывоз — точка, доставка — магазин записи товара.
   * Для самовывоза, если ДРУГАЯ точка покрывает количество — подсказываем её.
   * Не ошибка: фронт показывает предупреждение до создания заказа,
   * авторитетная проверка остаётся в create().
   */
  private async quoteStockProblems(
    method: DeliveryMethod,
    lines: Array<{ p: ProductInternal; quantity: number }>,
  ): Promise<QuoteStockProblem[]> {
    const targetStoreId = await this.resolveTargetStore(method);
    const pickupStores = isPickupPoint(method)
      ? resolvePickupStores(await this.db.select().from(evotorStores))
      : [];
    const problems: QuoteStockProblem[] = [];
    for (const { p, quantity } of lines) {
      const availableQty = await this.storeOrderable(
        p,
        targetStoreId ?? p.storeId,
      );
      if (availableQty >= quantity) continue;
      const problem: QuoteStockProblem = { id: p.slug, availableQty };
      if (isPickupPoint(method)) {
        const other = otherPickupPoint(method, pickupStores);
        if (other) {
          const otherQty = await this.storeOrderable(p, other.storeId);
          if (otherQty >= quantity) {
            problem.otherPickup = { point: other.point, availableQty: otherQty };
          }
        }
      }
      problems.push(problem);
    }
    return problems;
  }
```

4c. В `quoteDelivery()` перед `try {` добавить:

```ts
    const stockProblems = await this.quoteStockProblems(
      dto.deliveryMethod,
      lines,
    );
```

и в возвращаемый объект внутри try (после `freeDeliveryThresholdRub: ...`):

```ts
        ...(stockProblems.length ? { stockProblems } : {}),
```

- [ ] **Step 5: Тест сервисного уровня**

`apps/backend/src/orders/quote-stock.spec.ts` — по образцу СУЩЕСТВУЮЩИХ спеков orders.service (посмотреть, как соседние спеки конструируют сервис/моки; если такого паттерна нет — тестировать через прямой вызов private-методов у инстанса с фейковым db):

```ts
import { describe, expect, test } from 'bun:test';
import { OrdersService } from './orders.service';

/**
 * Фейковый db: execute() отвечает по очереди подготовленными ответами,
 * select().from() отдаёт магазины. Проверяем ЛОГИКУ quoteStockProblems
 * (выбор целевого магазина, подсказка другой точки), математика остатка
 * уже покрыта stock.spec/catalog-availability.spec.
 */
function fakeDb(opts: {
  stores: Array<{ id: string; address: string | null; name?: string }>;
  productRows: Record<string, Array<Record<string, unknown>>>; // ключ `${storeId}`
  reservedByStore?: Record<string, string>;
}) {
  return {
    select: () => ({ from: () => Promise.resolve(opts.stores) }),
    execute: (query: { queryChunks?: unknown } & object) => {
      const text = JSON.stringify(query);
      // запрос товара содержит имя таблицы evotor_products
      if (text.includes('evotor_products')) {
        // storeId — последний строковый параметр запроса; извлекаем грубо
        const store = opts.stores.find((s) => text.includes(s.id));
        return Promise.resolve({ rows: (store && opts.productRows[store.id]) ?? [] });
      }
      const store = opts.stores.find((s) => text.includes(s.id));
      return Promise.resolve({
        rows: [{ reserved: (store && opts.reservedByStore?.[store.id]) ?? '0' }],
      });
    },
  };
}
```

⚠️ Если сериализация drizzle-запроса в JSON не содержит параметров — НЕ строить хрупкий парсинг: вместо этого замокать `storeOrderable` напрямую и тестировать только `quoteStockProblems`:

```ts
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
  ({ slug, storeId, matchKey: 'mk-' + slug, measure: 'шт', portionMassG: null }) as never;

describe('quoteStockProblems', () => {
  const stores = [
    { id: 'len', address: 'ул. Ленинградская 75/2' },
    { id: 'tit', address: 'ул. Титова 32' },
  ];

  test('самовывоз: нехватка в точке + другая точка покрывает → otherPickup', async () => {
    const svc = service(stores);
    const avail: Record<string, number> = { len: 5, tit: 1 };
    (svc as unknown as { storeOrderable: (p: never, s: string) => Promise<number> })
      .storeOrderable = (_p, storeId) => Promise.resolve(avail[storeId] ?? 0);
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
    (svc as unknown as { storeOrderable: (p: never, s: string) => Promise<number> })
      .storeOrderable = (_p, storeId) => Promise.resolve(avail[storeId] ?? 0);
    const problems = await (
      svc as unknown as {
        quoteStockProblems: (m: string, l: unknown[]) => Promise<unknown[]>;
      }
    ).quoteStockProblems('pickup_titova', [{ p: P('syr', 'len'), quantity: 3 }]);
    expect(problems).toEqual([{ id: 'syr', availableQty: 1 }]);
  });

  test('хватает → пусто', async () => {
    const svc = service(stores);
    (svc as unknown as { storeOrderable: (p: never, s: string) => Promise<number> })
      .storeOrderable = () => Promise.resolve(10);
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
    (svc as unknown as { storeOrderable: (p: never, s: string) => Promise<number> })
      .storeOrderable = (_p, storeId) => {
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
```

(Если Object.create-подход не взлетит с приватниками — использовать `new OrdersService(...)` с минимальными фейковыми зависимостями по образцу соседних спеков. Суть тестов сохранить.)

- [ ] **Step 6: Всё зелёное**

Run: `cd apps/backend && bun test`
Expected: PASS, 0 fail.

⚠️ quoteDelivery теперь трогает db (`select(evotorStores)` + `execute`) — существующие спеки quoteDelivery с фейками без этих методов могут упасть «db.select is not a function»: дополнить их фейки (select→from→магазины с адресами «Ленинградская»/«Титова», execute→строка товара с запасом), НЕ ослаблять проверки.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/orders
git commit -m "feat(orders): quote предпроверяет остаток целевого магазина + подсказка другой точки (#37)"
```

---

### Task 5: Фронт — типы API + разбивка на странице товара

**Files:**
- Modify: `apps/frontend/src/lib/api.ts` (ApiCard, ApiDeliveryQuote)
- Modify: `apps/frontend/src/components/product/ProductInfo.tsx` (блок «Самовывоз»)
- Modify: `apps/frontend/src/routes/product.$slug.tsx:196-201` (пробросить pickupAvailability)

- [ ] **Step 1: Типы в api.ts**

В `ApiCard` после `availableQty: number;` добавить:

```ts
  pickupAvailability?: Array<{
    point: "pickup_leningradskaya" | "pickup_titova";
    availableQty: number;
  }>;
```

В `ApiDeliveryQuote` добавить последним полем:

```ts
  stockProblems?: Array<{
    id: string;
    availableQty: number;
    otherPickup?: {
      point: "pickup_leningradskaya" | "pickup_titova";
      availableQty: number;
    };
  }>;
```

- [ ] **Step 2: ProductInfo — блок разбивки**

В `apps/frontend/src/components/product/ProductInfo.tsx`:

2a. В `ProductInfoDetail` добавить:

```ts
  pickupAvailability?: Array<{
    point: "pickup_leningradskaya" | "pickup_titova";
    availableQty: number;
  }>;
```

2b. Константа адресов (после BADGE_STYLES; те же адреса, что в чекауте):

```ts
const PICKUP_POINT_ADDRESS: Record<string, string> = {
  pickup_leningradskaya: "Ленинградская 75/2",
  pickup_titova: "Титова 32",
};
```

2c. Перед блоком `{/* Counter + CTA */}` (строка ~240) вставить:

```tsx
      {/* Наличие по точкам самовывоза (#37): честно, из тех же данных, что заказ */}
      {(detail.pickupAvailability?.length ?? 0) > 0 && (
        <div
          className="flex flex-col gap-1.5 rounded-2xl"
          style={{ backgroundColor: "rgba(31,26,14,0.04)", padding: "12px 16px" }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            Самовывоз
          </span>
          {detail.pickupAvailability!.map((pa) => (
            <span
              key={pa.point}
              className="inline-flex items-center gap-1.5"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color:
                  pa.availableQty > 0
                    ? "var(--color-text)"
                    : "var(--color-text-muted)",
              }}
            >
              <MapPin
                size={14}
                style={{
                  color:
                    pa.availableQty > 0
                      ? "var(--color-success)"
                      : "var(--color-text-muted)",
                  flexShrink: 0,
                }}
              />
              {PICKUP_POINT_ADDRESS[pa.point] ?? pa.point} —{" "}
              {pa.availableQty > 0
                ? `${pa.availableQty} ${product.unit}`
                : "нет в наличии"}
            </span>
          ))}
        </div>
      )}
```

(`MapPin` уже импортирован в этом файле.)

- [ ] **Step 3: Пробросить данные со страницы**

В `apps/frontend/src/routes/product.$slug.tsx` в объект `detail={{ ... }}` (строки ~196-201) добавить строку:

```tsx
                pickupAvailability: detail.pickupAvailability,
```

- [ ] **Step 4: Типы зелёные**

Run: `cd apps/frontend && ./node_modules/.bin/tsc --noEmit`
Expected: 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/api.ts apps/frontend/src/components/product/ProductInfo.tsx apps/frontend/src/routes/product.$slug.tsx
git commit -m "feat(front): наличие по точкам самовывоза на странице товара (#37)"
```

---

### Task 6: Фронт — предупреждение и гейт на шаге 1 чекаута

**Files:**
- Modify: `apps/frontend/src/routes/checkout.tsx`

- [ ] **Step 1: Производное состояние**

После `const isPickup = ...` (строка ~124) добавить:

```tsx
  // Мягкая серверная предпроверка остатка по целевому магазину (#37):
  // предупреждаем на шаге 1, авторитетная проверка остаётся при создании заказа.
  const stockProblems = quote?.stockProblems ?? [];
```

- [ ] **Step 2: Гейт перехода**

В `goNext()` (строка ~230) после `if (!validateStep(step)) return;` добавить:

```tsx
    if (step === 1 && form.delivery && stockProblems.length > 0) {
      toast.error("Недостаточно наличия для выбранного способа получения");
      return;
    }
```

В `submitOrder` после `if (!validateStep(1)) { setStep(1); return; }` добавить:

```tsx
    if (stockProblems.length > 0) {
      setStep(1);
      return;
    }
```

- [ ] **Step 3: Предупреждающий блок в UI шага 1**

Найти в разметке шага 1 конец блока способов оплаты (радио «Картой при получении», ~строка 520; вставить ПОСЛЕ закрытия контейнера способов оплаты, внутри контента шага 1):

```tsx
                    {form.delivery && stockProblems.length > 0 && (
                      <div
                        className="flex flex-col gap-2 rounded-2xl"
                        style={{
                          border: "1px solid rgba(192,84,52,0.35)",
                          backgroundColor: "rgba(192,84,52,0.07)",
                          padding: "14px 16px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 13,
                            fontWeight: 700,
                            color: "var(--color-error)",
                          }}
                        >
                          {isPickup
                            ? "В этом пункте не хватает наличия"
                            : "Для доставки не хватает наличия"}
                        </span>
                        {stockProblems.map((d) => {
                          const inCart =
                            items.find((i) => i.product.id === d.id)?.quantity ?? 0;
                          return (
                            <span
                              key={d.id}
                              style={{
                                fontFamily: "var(--font-body)",
                                fontSize: 13,
                                color: "var(--color-text)",
                              }}
                            >
                              «{nameOf(d.id)}»: доступно {d.availableQty} (в корзине{" "}
                              {inCart})
                              {d.otherPickup &&
                                ` — есть в пункте ${PICKUP_ADDRESSES[d.otherPickup.point]}: ${d.otherPickup.availableQty}`}
                            </span>
                          );
                        })}
                        <span
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 12,
                            color: "var(--color-text-muted)",
                          }}
                        >
                          Выберите другой способ получения или уменьшите количество
                          в корзине.
                        </span>
                      </div>
                    )}
```

⚠️ `nameOf` уже существует в checkout.tsx (используется в обработке ошибок сабмита ~строка 307) — переиспользовать; если он объявлен внутри submitOrder — поднять объявление на уровень компонента без изменения логики.

- [ ] **Step 4: Типы зелёные**

Run: `cd apps/frontend && ./node_modules/.bin/tsc --noEmit`
Expected: 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/routes/checkout.tsx
git commit -m "feat(front): чекаут заранее предупреждает о нехватке в выбранной точке (#37)"
```

---

### Task 7: Полные гейты

- [ ] **Step 1: Бэкенд** — `cd apps/backend && bun test` → 0 fail; `bun run build` → успех; `bun run lint` → чисто.
- [ ] **Step 2: Фронт** — `cd apps/frontend && ./node_modules/.bin/tsc --noEmit` → 0 ошибок; прод-сборка НЕ здесь (перед деплоем, с VITE_API_URL).
- [ ] **Step 3: Коммит хвостов, если остались.**

---

## После плана (вне субагентов, ведёт оркестратор)

1. Состязательное ревью (Workflow, линзы: корректность математики/гонки/UX/регресс create()).
2. Живой e2e (headless playwright): страница товара с разбивкой; чекаут — «неправильная» точка отбита с подсказкой, «правильная» проходит.
3. Деплой: бэкап → бэкенд dist → фронт .output (VITE_API_URL=https://ecomarket-altai.ru/api/v1) → pm2 → прод-смоук.
4. Обновить задачу #37 и память.
