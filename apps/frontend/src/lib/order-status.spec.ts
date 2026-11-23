import { describe, expect, it } from "bun:test";

import {
  ORDER_POLL_MAX_ATTEMPTS,
  ORDER_STATUS_LABELS,
  shouldPollOrderStatus,
} from "./order-status";

describe("order-status", () => {
  it("unifies the initial new status label across storefronts", () => {
    expect(ORDER_STATUS_LABELS.new).toBe("Принят");
    expect(ORDER_STATUS_LABELS.awaiting_payment).toBe("Ожидает оплаты");
    expect(ORDER_STATUS_LABELS.paid).toBe("Оплачен");
    expect(ORDER_STATUS_LABELS.cancelled).toBe("Отменён");
  });

  it("polls only while status is awaiting_payment and attempts remain", () => {
    expect(shouldPollOrderStatus("awaiting_payment", 0)).toBe(true);
    expect(shouldPollOrderStatus("awaiting_payment", ORDER_POLL_MAX_ATTEMPTS - 1)).toBe(true);
    expect(shouldPollOrderStatus("awaiting_payment", ORDER_POLL_MAX_ATTEMPTS)).toBe(false);
    expect(shouldPollOrderStatus("awaiting_payment", -1)).toBe(false);
    expect(shouldPollOrderStatus("awaiting_payment", Number.NaN)).toBe(false);
  });

  it("stops polling for terminal and non-payment statuses", () => {
    for (const status of ["new", "paid", "assembling", "shipped", "completed", "cancelled", ""]) {
      expect(shouldPollOrderStatus(status, 0)).toBe(false);
    }
  });
});
