import { describe, expect, it } from 'bun:test';
import { blocksHandoffWithoutOffsetReceipt } from './order-status';

/**
 * Находка финального аудита (скептик умер по таймауту — проверено вручную,
 * подтверждено): кассир мог перевести оплаченный МАРКИРОВАННЫЙ заказ в
 * «готов к выдаче»/«передан в доставку», забыв фискализацию, — товар ушёл бы
 * покупателю без чека зачёта с кодами (54-ФЗ/«Честный знак»). Гейт: выход из
 * сборки для маркированного онлайн-оплаченного заказа закрыт, пока не выбит
 * чек зачёта (fiscal_receipt_id).
 */
describe('blocksHandoffWithoutOffsetReceipt', () => {
  const marked = { hasMarkedItems: true, isOnlinePaid: true, fiscalized: false };

  it('маркированный онлайн-оплаченный БЕЗ чека зачёта → выдача заблокирована', () => {
    expect(blocksHandoffWithoutOffsetReceipt('ready_for_pickup', marked)).toBe(true);
    expect(blocksHandoffWithoutOffsetReceipt('shipped', marked)).toBe(true);
  });

  it('после фискализации — путь свободен', () => {
    expect(
      blocksHandoffWithoutOffsetReceipt('ready_for_pickup', { ...marked, fiscalized: true }),
    ).toBe(false);
  });

  it('немаркированный — не блокируется (чек ушёл при оплате)', () => {
    expect(
      blocksHandoffWithoutOffsetReceipt('ready_for_pickup', { ...marked, hasMarkedItems: false }),
    ).toBe(false);
  });

  it('офлайн-оплата (самовывоз, чек бьёт касса при выдаче) — не блокируется', () => {
    expect(
      blocksHandoffWithoutOffsetReceipt('shipped', { ...marked, isOnlinePaid: false }),
    ).toBe(false);
  });

  it('переходы вне выдачи (paid, assembling, cancelled) — не трогаем', () => {
    expect(blocksHandoffWithoutOffsetReceipt('assembling', marked)).toBe(false);
    expect(blocksHandoffWithoutOffsetReceipt('cancelled', marked)).toBe(false);
    expect(blocksHandoffWithoutOffsetReceipt('paid', marked)).toBe(false);
  });
});
