import { describe, expect, test } from 'bun:test';
import { hasStorefrontCategory } from './publishable';

describe('hasStorefrontCategory (гейт витрины, ТЗ 8.2)', () => {
  test('товар с категорией публикуется', () => {
    expect(hasStorefrontCategory({ category: { slug: 'syry-i-maslo' } })).toBe(
      true,
    );
  });

  test('без категории — скрыт (categorySlug=null ломал счётчики фильтра)', () => {
    expect(hasStorefrontCategory({ category: null })).toBe(false);
    expect(hasStorefrontCategory({})).toBe(false);
  });

  test('категория без slug — скрыт (битые данные не публикуем)', () => {
    expect(hasStorefrontCategory({ category: {} })).toBe(false);
    expect(hasStorefrontCategory({ category: { slug: '' } })).toBe(false);
  });
});
