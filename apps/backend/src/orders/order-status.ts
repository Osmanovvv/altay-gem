import type { OrderStatus } from './orders.service';

/**
 * Разрешённые переходы статусов заказа (ТЗ р.8.2).
 *
 * new → assembling            офлайн-оплата: заказ сразу в работу
 * awaiting_payment → paid     подтверждение оплаты (вебхук/вручную)
 * paid → assembling           оплаченный пошёл в сборку
 * assembling → ready_for_pickup | shipped
 * ready_for_pickup/shipped → completed
 * cancelled — из new/awaiting_payment/paid: ТЗ разрешает отмену только
 * ДО «собирается» (товар ещё не снят с полки, резерв просто освобождается).
 * completed и cancelled — терминальные.
 */
const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ['assembling', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['assembling', 'cancelled'],
  assembling: ['ready_for_pickup', 'shipped'],
  ready_for_pickup: ['completed'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
};

/** Допустим ли переход from→to. Чистая функция для guard'а setStatus. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}
