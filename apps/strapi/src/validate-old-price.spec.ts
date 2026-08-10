import { describe, expect, test } from 'bun:test';
import { oldPriceProblem } from './validate-old-price';

/**
 * Проверка старой цены при сохранении товара в админке.
 *
 * Зачёркнутая цена показывается, только пока она выше текущей (то же правило,
 * что на витрине — backend/src/catalog/catalog-pricing.ts). Раньше контент-
 * менеджер узнавал об ошибке никак: поле сохранялось, а на карточке просто
 * ничего не появлялось. Хуже с весовыми — цену вписывали за килограмм, и
 * карточка рисовала «-90%».
 *
 * Текущей цены менеджер нигде в админке не видит, поэтому сообщение обязано
 * её назвать.
 */
const product = { name: 'Барсучий жир', priceRub: 690, isWeight: false };

describe('oldPriceProblem', () => {
  test('старая цена выше текущей — всё в порядке', () => {
    expect(oldPriceProblem({ oldPriceRub: 790 }, product)).toBeNull();
  });

  test('поле не заполнено — проверять нечего', () => {
    expect(oldPriceProblem({}, product)).toBeNull();
    expect(oldPriceProblem({ oldPriceRub: null }, product)).toBeNull();
  });

  test('старая цена ниже текущей — ошибка с указанием нынешней цены', () => {
    const msg = oldPriceProblem({ oldPriceRub: 500 }, product);
    expect(msg).toContain('500');
    expect(msg).toContain('690');
  });

  test('равные цены — тоже ошибка: скидки нет', () => {
    expect(oldPriceProblem({ oldPriceRub: 690 }, product)).not.toBeNull();
  });

  test('строка из формы приводится к числу', () => {
    expect(oldPriceProblem({ oldPriceRub: '790' }, product)).toBeNull();
    expect(oldPriceProblem({ oldPriceRub: '500' }, product)).not.toBeNull();
  });

  test('у весового товара сообщение уточняет: цена за порцию, не за килограмм', () => {
    const weighted = { name: 'Сыр', priceRub: 119, isWeight: true };
    const msg = oldPriceProblem({ oldPriceRub: 1190 }, weighted);
    expect(msg).toBeNull(); // 1190 > 119 — формально допустимо
    const wrong = oldPriceProblem({ oldPriceRub: 100 }, weighted);
    expect(wrong).toContain('порцию');
  });

  test('цена товара неизвестна — не блокируем сохранение', () => {
    // Мост мог ответить без цены: молча пропускаем, как и при сбое сети.
    expect(oldPriceProblem({ oldPriceRub: 100 }, { priceRub: undefined })).toBeNull();
    expect(oldPriceProblem({ oldPriceRub: 100 }, { priceRub: 0 })).toBeNull();
  });

  test('мусор в поле не роняет сохранение', () => {
    expect(oldPriceProblem({ oldPriceRub: 'abc' }, product)).toBeNull();
    expect(oldPriceProblem({ oldPriceRub: -5 }, product)).toBeNull();
  });
});
