import { describe, expect, it } from 'bun:test';
import { parseOrderIdFromSearch, stripOrderParamFromUrl } from './order-query';

describe('parseOrderIdFromSearch', () => {
  it('достаёт положительный целый id заказа из query', () => {
    expect(parseOrderIdFromSearch('?order=42')).toBe(42);
    expect(parseOrderIdFromSearch('order=105')).toBe(105);
    expect(parseOrderIdFromSearch('?tab=orders&order=7#top')).toBe(7);
  });

  it('отклоняет пустые и некорректные значения', () => {
    expect(parseOrderIdFromSearch('')).toBeNull();
    expect(parseOrderIdFromSearch('?tab=orders')).toBeNull();
    expect(parseOrderIdFromSearch('?order=0')).toBeNull();
    expect(parseOrderIdFromSearch('?order=-5')).toBeNull();
    expect(parseOrderIdFromSearch('?order=abc')).toBeNull();
    expect(parseOrderIdFromSearch('?order=12.5')).toBeNull();
    expect(parseOrderIdFromSearch('?order=007')).toBeNull();
  });
});

describe('stripOrderParamFromUrl', () => {
  it('убирает только order, сохраняя путь, прочие параметры и hash', () => {
    expect(
      stripOrderParamFromUrl('https://admin.example.com/manage-abc/plugins/orders?order=42'),
    ).toBe('/manage-abc/plugins/orders');
    expect(
      stripOrderParamFromUrl(
        'https://admin.example.com/manage-abc/plugins/orders?tab=orders&order=42#top',
      ),
    ).toBe('/manage-abc/plugins/orders?tab=orders#top');
    expect(stripOrderParamFromUrl('/manage-abc/plugins/orders?order=42')).toBe(
      '/manage-abc/plugins/orders',
    );
  });
});
