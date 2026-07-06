import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, MapPin, Package, XCircle } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ApiError, fetchOrder, type ApiOrderStatus } from "@/lib/api";

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

const STATUS_LABELS: Record<string, string> = {
  new: "Принят",
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачен",
  assembling: "Собирается",
  ready_for_pickup: "Готов к выдаче",
  shipped: "Передан в доставку",
  completed: "Выполнен",
  cancelled: "Отменён",
};

/** Страница заказа «спасибо/статус»: /order/{id}?token=… (ТЗ 6.7, р.9). */
export const Route = createFileRoute("/order/$id")({
  validateSearch: (raw: Record<string, unknown>): { token?: string } => ({
    token: typeof raw.token === "string" ? raw.token : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ params, deps }) => {
    if (!deps.token) return { order: null as ApiOrderStatus | null };
    try {
      return { order: await fetchOrder(params.id, deps.token) };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return { order: null as ApiOrderStatus | null };
      }
      throw err;
    }
  },
  head: () => ({
    meta: [{ title: "Ваш заказ - Жемчужина Алтая" }],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { order } = Route.useLoaderData();

  return (
    <div style={{ backgroundColor: "var(--color-bg-cream)", minHeight: "100vh" }}>
      <Header />
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-24 md:px-8">
        {!order ? (
          <NotFound />
        ) : (
          <div
            style={{
              backgroundColor: "#fffdf7",
              border: "1px solid rgba(31,26,14,0.06)",
              borderRadius: 24,
              padding: "32px 28px",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div className="flex items-center gap-3">
              {order.status === "cancelled" ? (
                <XCircle size={34} style={{ color: "var(--color-error)" }} />
              ) : (
                <CheckCircle2 size={34} style={{ color: "var(--color-success)" }} />
              )}
              <div>
                <h1
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 30,
                    fontWeight: 600,
                    color: "var(--color-bg-dark)",
                    lineHeight: 1.1,
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
                      order.status === "cancelled"
                        ? "var(--color-error)"
                        : "var(--color-accent-dark)",
                  }}
                >
                  <Clock size={14} />
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
            </div>

            <p
              className="mt-5 flex items-start gap-2"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 15,
                lineHeight: 1.55,
                color: "var(--color-text)",
                backgroundColor: "rgba(200,150,62,0.08)",
                borderRadius: 12,
                padding: "12px 16px",
              }}
            >
              <MapPin size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              {order.instruction}
            </p>

            <h2
              className="mt-8 flex items-center gap-2"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--color-text-muted)",
              }}
            >
              <Package size={16} /> Состав заказа
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {order.items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-3"
                  style={{ fontFamily: "var(--font-body)", fontSize: 15 }}
                >
                  <span>
                    {it.name}
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {" "}
                      × {it.quantity} ({it.unit})
                    </span>
                  </span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {formatPrice(it.sumRub)}
                  </span>
                </li>
              ))}
            </ul>

            <hr style={{ borderColor: "rgba(31,26,14,0.08)", margin: "18px 0" }} />
            <Line label="Товары" value={formatPrice(order.totals.subtotalRub)} />
            {order.totals.discountRub > 0 && (
              <Line label="Скидка" value={`−${formatPrice(order.totals.discountRub)}`} />
            )}
            <Line
              label="Доставка"
              value={
                order.totals.deliveryRub === 0
                  ? "Бесплатно"
                  : formatPrice(order.totals.deliveryRub)
              }
            />
            <div className="mt-2 flex items-baseline justify-between">
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
                  fontSize: 28,
                  fontWeight: 700,
                  color: "var(--color-accent)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatPrice(order.totals.totalRub)}
              </span>
            </div>

            <Link
              to="/catalog"
              className="mt-8 inline-flex items-center justify-center rounded-full"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg-dark)",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 15,
                padding: "13px 26px",
              }}
            >
              Продолжить покупки
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between py-1"
      style={{ fontFamily: "var(--font-body)", fontSize: 14 }}
    >
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="text-center">
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 36,
          fontWeight: 600,
          color: "var(--color-bg-dark)",
        }}
      >
        Заказ не найден
      </h1>
      <p
        className="mt-3"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-text-muted)" }}
      >
        Проверьте ссылку из подтверждения заказа — в ней должен быть токен доступа.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-full"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg-dark)",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          padding: "12px 24px",
        }}
      >
        На главную
      </Link>
    </div>
  );
}
