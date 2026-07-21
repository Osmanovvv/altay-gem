import { describe, expect, it } from 'bun:test';
import { humanError } from './error-map';

describe('humanError', () => {
  it('коды бэкенда → фиксированные тексты', () => {
    expect(humanError({ code: 'ORDER_NOT_FISCALIZED', message: 'x' }))
      .toBe('Сначала отсканируйте коды и выбейте чек — потом выдача');
    expect(humanError({ code: 'ORDER_FISCALIZED', message: 'x' }))
      .toBe('Чек уже выбит — отмена только после чека возврата в ЮKassa');
    expect(humanError({ code: 'ORDER_TRANSITION_FORBIDDEN', message: 'x' }))
      .toBe('Действие недоступно для текущего статуса — обновите страницу');
    expect(humanError({ code: 'ORDERS_NOT_CONFIGURED', message: 'x' }))
      .toBe('Раздел не настроен: нет доступа к серверу заказов');
    expect(humanError({ code: 'ORDERS_UNAVAILABLE', message: 'x' }))
      .toBe('Сервер заказов недоступен. Повторите');
  });
  it('код, совпадающий с ключом Object.prototype, не отдаёт функцию', () => {
    expect(humanError({ code: 'toString', message: 'x' })).toBe('x');
  });
  it('без кода — текст бэкенда как есть (он человекочитаемый)', () => {
    expect(humanError({ message: 'кодов маркировки 1, а единиц 2 — чек не собрать' }))
      .toBe('кодов маркировки 1, а единиц 2 — чек не собрать');
  });
  it('совсем без текста — общий текст', () => {
    expect(humanError({})).toBe('Не удалось связаться с сервером заказов. Повторите');
  });
});
