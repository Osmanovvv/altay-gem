import { describe, expect, it } from 'bun:test';
import { canTransition } from './order-status';

/**
 * Граф статусов заказа (ТЗ р.8.2): новый → ожидает оплаты → оплачен →
 * собирается → готов к выдаче | передан в доставку → выполнен. Отмена —
 * ТОЛЬКО до «собирается» (вручную или автоотмена). Ранее допускались
 * произвольные скачки (new→completed) и отмена после сборки — дыра приёмки.
 */
describe('canTransition', () => {
  it('штатная цепочка самовывоза: new→assembling→ready_for_pickup→completed', () => {
    expect(canTransition('new', 'assembling')).toBe(true);
    expect(canTransition('assembling', 'ready_for_pickup')).toBe(true);
    expect(canTransition('ready_for_pickup', 'completed')).toBe(true);
  });

  it('штатная цепочка онлайн-оплаты с доставкой: awaiting_payment→paid→assembling→shipped→completed', () => {
    expect(canTransition('awaiting_payment', 'paid')).toBe(true);
    expect(canTransition('paid', 'assembling')).toBe(true);
    expect(canTransition('assembling', 'shipped')).toBe(true);
    expect(canTransition('shipped', 'completed')).toBe(true);
  });

  it('отмена разрешена ДО сборки: new/awaiting_payment/paid → cancelled', () => {
    expect(canTransition('new', 'cancelled')).toBe(true);
    expect(canTransition('awaiting_payment', 'cancelled')).toBe(true);
    expect(canTransition('paid', 'cancelled')).toBe(true);
  });

  it('отмена ПОСЛЕ начала сборки запрещена (ТЗ: «из любого статуса до собирается»)', () => {
    expect(canTransition('assembling', 'cancelled')).toBe(false);
    expect(canTransition('ready_for_pickup', 'cancelled')).toBe(false);
    expect(canTransition('shipped', 'cancelled')).toBe(false);
  });

  it('скачки через этапы запрещены: new→completed, paid→shipped, new→ready_for_pickup', () => {
    expect(canTransition('new', 'completed')).toBe(false);
    expect(canTransition('paid', 'shipped')).toBe(false);
    expect(canTransition('new', 'ready_for_pickup')).toBe(false);
  });

  it('движение назад запрещено: paid→awaiting_payment, completed→assembling', () => {
    expect(canTransition('paid', 'awaiting_payment')).toBe(false);
    expect(canTransition('completed', 'assembling')).toBe(false);
  });

  it('терминальные никуда не ведут: cancelled→*, completed→*', () => {
    expect(canTransition('cancelled', 'new')).toBe(false);
    expect(canTransition('completed', 'cancelled')).toBe(false);
  });
});
