import { useEffect, useState } from "react";

import { ApiError, fetchOrder, type ApiOrderStatus } from "@/lib/api";
import { ORDER_POLL_INTERVAL_MS, shouldPollOrderStatus } from "@/lib/order-status";

const TERMINAL_POLL_STATUSES = new Set([401, 403, 404]);

/**
 * Фоново обновляет заказ, пока он ждёт подтверждения оплаты от ЮKassa.
 */
export function useOrderStatusPolling(
  initialOrder: ApiOrderStatus | null,
  orderId: string,
  token: string | undefined,
): ApiOrderStatus | null {
  const [order, setOrder] = useState(initialOrder);
  const currentStatus = order?.status ?? "";

  useEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  useEffect(() => {
    if (!orderId || !token || !shouldPollOrderStatus(currentStatus, 0)) return;

    let cancelled = false;
    let inFlight = false;
    let attempts = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleNext = () => {
      if (cancelled || !shouldPollOrderStatus(currentStatus, attempts)) return;
      clearTimer();
      timerId = setTimeout(() => {
        void pollOnce();
      }, ORDER_POLL_INTERVAL_MS);
    };

    const pollOnce = async () => {
      if (cancelled || inFlight || !shouldPollOrderStatus(currentStatus, attempts)) return;
      inFlight = true;
      attempts += 1;
      let stopped = false;

      try {
        const fresh = await fetchOrder(orderId, token);
        if (!cancelled) {
          setOrder(fresh);
          if (!shouldPollOrderStatus(fresh.status, attempts)) {
            stopped = true;
          }
        }
      } catch (err) {
        if (err instanceof ApiError && TERMINAL_POLL_STATUSES.has(err.status)) {
          stopped = true;
        }
      } finally {
        inFlight = false;
      }

      if (!cancelled && !stopped && shouldPollOrderStatus(currentStatus, attempts)) {
        scheduleNext();
      }
    };

    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        clearTimer();
        void pollOnce();
      }
    };

    scheduleNext();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      cancelled = true;
      clearTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [orderId, token, currentStatus]);

  return order;
}
