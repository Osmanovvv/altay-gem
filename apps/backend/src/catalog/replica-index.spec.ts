import { describe, expect, it } from 'bun:test';
import { indexReplicaByUuid } from './replica-index';

/**
 * Одна и та же номенклатура выгружена в ОБА магазина, поэтому на один
 * evotor_uuid приходится две строки реплики — по одной на точку. Карточка же
 * витрины одна, и цену она берёт из ОДНОЙ строки.
 *
 * Живой факт 09.08.2026: у 58 из 644 общих товаров цены в магазинах разные,
 * местами на 40% (350 ₽ против 490 ₽). Раньше строка выбиралась порядком,
 * в котором Postgres вернул выборку — без ORDER BY он произволен. Между
 * пересборками кэша (60 с) карточка могла показывать то одну цену, то другую,
 * и та же строка фиксировалась в заказ.
 *
 * Правило: выигрывает строка магазина с наименьшим store_id. Оно ничего не
 * решает про экономику (это отдельный вопрос — цена по выбранной точке), но
 * делает витрину предсказуемой.
 */
const row = (storeId: string, evotorUuid: string, priceKopecks: number) => ({
  storeId,
  evotorUuid,
  priceKopecks,
});

describe('indexReplicaByUuid', () => {
  it('один товар в одном магазине — берётся как есть', () => {
    const idx = indexReplicaByUuid([row('B', 'u1', 100)]);
    expect(idx.get('u1')).toEqual(row('B', 'u1', 100));
  });

  it('товар в двух магазинах — выигрывает наименьший store_id', () => {
    const idx = indexReplicaByUuid([row('B', 'u1', 49000), row('A', 'u1', 35000)]);
    expect(idx.get('u1')!.storeId).toBe('A');
    expect(idx.get('u1')!.priceKopecks).toBe(35000);
  });

  it('результат НЕ зависит от порядка строк в выборке', () => {
    const asc = indexReplicaByUuid([row('A', 'u1', 35000), row('B', 'u1', 49000)]);
    const desc = indexReplicaByUuid([row('B', 'u1', 49000), row('A', 'u1', 35000)]);
    expect(asc.get('u1')).toEqual(desc.get('u1')!);
  });

  it('разные товары не мешают друг другу', () => {
    const idx = indexReplicaByUuid([
      row('B', 'u1', 100),
      row('A', 'u2', 200),
      row('A', 'u1', 300),
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get('u1')!.storeId).toBe('A');
    expect(idx.get('u2')!.storeId).toBe('A');
  });

  it('пустая выборка — пустой индекс, без падения', () => {
    expect(indexReplicaByUuid([]).size).toBe(0);
  });
});
