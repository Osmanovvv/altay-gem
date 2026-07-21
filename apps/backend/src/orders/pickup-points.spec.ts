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

  test('isPickupPoint не пропускает ключи прототипа', () => {
    expect(isPickupPoint('toString')).toBe(false);
  });

  test('PICKUP_POINTS перечисляет обе точки', () => {
    expect(PICKUP_POINTS).toEqual(['pickup_leningradskaya', 'pickup_titova']);
  });
});
