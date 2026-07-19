import { describe, expect, it } from 'bun:test';
import { idempotencyDecision } from './idempotency';

/**
 * Идемпотентность создания заказа (ТЗ р.9) по схеме «сначала захвати ключ».
 * Старая схема (SELECT → транзакция → INSERT в конце) давала гонку: два
 * параллельных одинаковых POST оба проходили SELECT пустым и создавали ДВА
 * заказа с двумя резервами. Теперь ключ вставляется ДО транзакции заглушкой
 * (responseBody=null = «обрабатывается»), а по существующей строке решает
 * чистая функция ниже.
 */
const NOW = Date.parse('2026-07-16T12:00:00Z');
const STALE_MS = 60_000;
const row = (over: Partial<{ requestHash: string; responseBody: unknown; createdAt: Date }>) => ({
  requestHash: 'h1',
  responseBody: { id: 7 } as unknown,
  createdAt: new Date(NOW - 5_000),
  ...over,
});

describe('idempotencyDecision', () => {
  it('строки нет (мы вставили заглушку) → owner: создаём заказ', () => {
    expect(idempotencyDecision(undefined, 'h1', NOW, STALE_MS)).toBe('owner');
  });

  it('есть готовый ответ с тем же хешем → replay: вернуть сохранённый ответ', () => {
    expect(idempotencyDecision(row({}), 'h1', NOW, STALE_MS)).toBe('replay');
  });

  it('тот же ключ, ДРУГОЙ запрос → conflict (409, ключ переиспользован)', () => {
    expect(idempotencyDecision(row({ requestHash: 'h2' }), 'h1', NOW, STALE_MS)).toBe('conflict');
    // конфликт хеша важнее прочего — даже если ответа ещё нет
    expect(
      idempotencyDecision(row({ requestHash: 'h2', responseBody: null }), 'h1', NOW, STALE_MS),
    ).toBe('conflict');
  });

  it('заглушка свежая (параллельный запрос ещё обрабатывается) → in_progress', () => {
    expect(idempotencyDecision(row({ responseBody: null }), 'h1', NOW, STALE_MS)).toBe(
      'in_progress',
    );
  });

  it('заглушка протухла (владелец упал, ответа не будет) → reclaim: перезахватить', () => {
    expect(
      idempotencyDecision(
        row({ responseBody: null, createdAt: new Date(NOW - STALE_MS - 1) }),
        'h1',
        NOW,
        STALE_MS,
      ),
    ).toBe('reclaim');
  });

  it('готовый ответ не протухает — replay даже для старой записи', () => {
    expect(
      idempotencyDecision(row({ createdAt: new Date(NOW - 86_400_000) }), 'h1', NOW, STALE_MS),
    ).toBe('replay');
  });
});
