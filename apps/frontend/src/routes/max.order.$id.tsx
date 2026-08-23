import { Link, createFileRoute } from "@tanstack/react-router";
import { Clock, MapPin, Package } from "lucide-react";

import { ApiError, fetchOrder } from "@/lib/api";

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачен",
  assembling: "Собирается",
  ready_for_pickup: "Готов к выдаче",
  shipped: "Передан в доставку",
  completed: "Выполнен",
  cancelled: "Отменён",
};

/**
 * Статус заказа в мини-аппе (ТЗ р.13). Доступ по токену из ссылки — тот же
 * механизм, что на сайте: номер заказа сам по себе ничего не открывает.
 */
export const Route = createFileRoute("/max/order/$id")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ params, deps }) => {
    if (!deps.token) return { order: null as null | Awaited<ReturnType<typeof fetchOrder>> };
    try {
      return { order: await fetchOrder(params.id, deps.token) };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return { order: null };
      throw err;
    }
  },
  component: MaxOrder,
});

function MaxOrder() {
  const { order } = Route.useLoaderData();

  if (!order) {
    return (
      <div className="px-6 pb-6 pt-16 text-center">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Заказ не найден
        </h1>
        <p
          className="mt-2"
          style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--color-text-muted)" }}
        >
          Проверьте ссылку из подтверждения заказа — в ней должен быть токен доступа
        </p>
        <Link
          to="/max/catalog"
          className="mt-6 inline-flex items-center justify-center rounded-full px-7"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg-dark)",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: 15,
            minHeight: 48,
            textDecoration: "none",
          }}
        >
          В каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-4">
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        Заказ {order.orderNumber}
      </h1>
      <span
        className="mt-1 inline-flex items-center gap-1.5"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          fontWeight: 600,
          color:
            order.status === "cancelled" ? "var(--color-error)" : "var(--color-accent-dark)",
        }}
      >
        <Clock size={14} />
        {STATUS_LABELS[order.status] ?? order.status}
      </span>

      <p
        className="mt-4 flex items-start gap-2 rounded-xl"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--color-text)",
          backgroundColor: "rgba(200,150,62,0.08)",
          padding: "12px 14px",
        }}
      >
        <MapPin size={16} className="mt-0.5 shrink-0" />
        {order.instruction}
      </p>

      {order.status === "awaiting_payment" && order.paymentUrl && (
        <a
          href={order.paymentUrl}
          className="mt-3 inline-flex w-full items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg-dark)",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: 15,
            minHeight: 48,
            textDecoration: "none",
          }}
        >
          Оплатить заказ
        </a>
      )}

      <h2
        className="mt-6 flex items-center gap-2"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-muted)",
        }}
      >
        <Package size={14} /> Состав заказа
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {order.items.map((it, i) => (
          <li
            key={`${it.name}-${i}`}
            className="flex items-baseline justify-between gap-3"
            style={{
              backgroundColor: "#fffdf7",
              border: "1px solid rgba(31,26,14,0.06)",
              borderRadius: 12,
              padding: "10px 12px",
            }}
          >
            <span className="min-w-0">
              <span
                className="block"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  color: "var(--color-text)",
                }}
              >
                {it.name}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                }}
              >
                {it.quantity} × {formatPrice(it.priceRub)} / {it.unit}
              </span>
            </span>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontVariantNumeric: "tabular-nums",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--color-text)",
              }}
            >
              {formatPrice(it.sumRub)}
            </span>
          </li>
        ))}
      </ul>

      <div
        className="mt-4 rounded-2xl"
        style={{ backgroundColor: "#fffdf7", border: "1px solid rgba(31,26,14,0.06)", padding: 14 }}
      >
        <Row label="Товары" value={formatPrice(order.totals.subtotalRub)} />
        {order.totals.discountRub > 0 && (
          <Row label="Скидка" value={`− ${formatPrice(order.totals.discountRub)}`} accent />
        )}
        <Row
          label="Доставка"
          value={order.totals.deliveryRub === 0 ? "бесплатно" : formatPrice(order.totals.deliveryRub)}
        />
        <div
          className="mt-2 flex items-baseline justify-between"
          style={{ borderTop: "1px solid rgba(31,26,14,0.08)", paddingTop: 10 }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Итого
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontVariantNumeric: "tabular-nums",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--color-accent)",
            }}
          >
            {formatPrice(order.totals.totalRub)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span
        style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 14,
          fontWeight: 600,
          color: accent ? "var(--color-error)" : "var(--color-text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
