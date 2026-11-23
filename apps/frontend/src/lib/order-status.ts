export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Принят",
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачен",
  assembling: "Собирается",
  ready_for_pickup: "Готов к выдаче",
  shipped: "Передан в доставку",
  completed: "Выполнен",
  cancelled: "Отменён",
};

export const ORDER_POLL_INTERVAL_MS = 3000;
export const ORDER_POLL_MAX_ATTEMPTS = 20;

export function shouldPollOrderStatus(status: string, attempt: number): boolean {
  if (!Number.isFinite(attempt) || attempt < 0 || attempt >= ORDER_POLL_MAX_ATTEMPTS) {
    return false;
  }
  return status === "awaiting_payment";
}
