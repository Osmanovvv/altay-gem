import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  BarChart2,
  Settings,
  TrendingUp,
  DollarSign,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Админ-панель - Жемчужина Алтая" }],
  }),
  component: AdminPage,
});

const NAV = [
  { id: "dashboard", label: "Дашборд", Icon: LayoutDashboard },
  { id: "products", label: "Товары", Icon: Package },
  { id: "orders", label: "Заказы", Icon: ShoppingCart },
  { id: "delivery", label: "Доставка", Icon: Truck },
  { id: "analytics", label: "Аналитика", Icon: BarChart2 },
  { id: "settings", label: "Настройки", Icon: Settings },
];

const STATS = [
  { Icon: TrendingUp, color: "#1E8A4C", bg: "rgba(30,138,76,0.1)", label: "Заказы сегодня", value: "7", change: "+2 вчера", changeColor: "#1E8A4C" },
  { Icon: DollarSign, color: "#C8973A", bg: "rgba(200,151,58,0.12)", label: "Выручка сегодня", value: "14 350 ₽", change: "+18%", changeColor: "#1E8A4C" },
  { Icon: Package, color: "#2563EB", bg: "rgba(37,99,235,0.1)", label: "Товаров в каталоге", value: "94", change: "3 категории", changeColor: "#6B7280" },
  { Icon: Truck, color: "#E07B1F", bg: "rgba(224,123,31,0.12)", label: "В доставке", value: "12", change: "СДЭК + Я.Доставка", changeColor: "#6B7280" },
];

const ORDERS = [
  { id: "#1042", product: "Донниковый мёд 2кг", sum: "1 780 ₽", delivery: "СДЭК", status: "Отправлен", statusColor: "#1E8A4C", statusBg: "rgba(30,138,76,0.12)" },
  { id: "#1041", product: "Набор Сладкоежка", sum: "2 650 ₽", delivery: "Я.Доставка", status: "Готов", statusColor: "#2563EB", statusBg: "rgba(37,99,235,0.12)" },
  { id: "#1040", product: "Мясо марала 1кг", sum: "2 150 ₽", delivery: "СДЭК", status: "Оплачен", statusColor: "#B07A0A", statusBg: "rgba(200,151,58,0.18)" },
  { id: "#1039", product: "Подарочный набор", sum: "2 650 ₽", delivery: "Самовывоз", status: "Выдан", statusColor: "#6B7280", statusBg: "rgba(107,114,128,0.14)" },
  { id: "#1038", product: "Горный мёд + чай", sum: "1 470 ₽", delivery: "СДЭК", status: "Отправлен", statusColor: "#1E8A4C", statusBg: "rgba(30,138,76,0.12)" },
];

const TOP = [
  { emoji: "🍯", name: "Донниковый мёд", sold: 47, pct: 90 },
  { emoji: "🦌", name: "Мясо марала", sold: 31, pct: 60 },
  { emoji: "🎁", name: "Набор Сладкоежка", sold: 28, pct: 54 },
  { emoji: "🌿", name: "Чай Таёжный", sold: 24, pct: 46 },
  { emoji: "💊", name: "Пантогематоген", sold: 19, pct: 36 },
];

function AdminPage() {
  const [active, setActive] = useState("dashboard");

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* SIDEBAR */}
      <aside
        className="flex flex-col shrink-0"
        style={{ width: 240, background: "#1A3028", minHeight: "100vh" }}
      >
        <div style={{ padding: 20 }}>
          <div
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              color: "#C8973A",
            }}
          >
            Жемчужина Алтая
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,251,243,0.4)", marginTop: 2 }}>
            Админ-панель
          </div>
        </div>

        <nav className="flex flex-col" style={{ marginTop: 8 }}>
          {NAV.map((n) => {
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setActive(n.id)}
                className="admin-nav-item flex items-center gap-3 text-left"
                style={{
                  fontSize: 14,
                  padding: "10px 20px",
                  borderRadius: 8,
                  margin: "2px 8px",
                  background: isActive ? "rgba(200,151,58,0.15)" : "transparent",
                  color: isActive ? "#C8973A" : "rgba(255,251,243,0.5)",
                  fontWeight: isActive ? 600 : 500,
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                <n.Icon size={18} />
                {n.label}
              </button>
            );
          })}
        </nav>

        <div
          style={{
            marginTop: "auto",
            padding: 20,
            fontSize: 11,
            color: "rgba(255,251,243,0.3)",
          }}
        >
          Демо-режим
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1" style={{ background: "#F4F4F4" }}>
        {/* Top bar */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: "24px 32px",
            background: "#FFFFFF",
            borderBottom: "1px solid #ECECEC",
          }}
        >
          <div
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#1A3028",
            }}
          >
            Дашборд
          </div>
          <div style={{ fontSize: 14, color: "#7A7A7A" }}>23 июня 2026</div>
        </div>

        {/* Stats */}
        <div
          className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          style={{ padding: "24px 32px" }}
        >
          {STATS.map((s) => (
            <div
              key={s.label}
              style={{
                background: "#FFFFFF",
                borderRadius: 16,
                padding: "20px 24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              <div className="flex items-center justify-between">
                <div style={{ fontSize: 13, color: "#7A7A7A" }}>{s.label}</div>
                <div
                  className="grid place-items-center"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: s.bg,
                  }}
                >
                  <s.Icon size={18} color={s.color} />
                </div>
              </div>
              <div
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: 32,
                  fontWeight: 700,
                  color: "#1A3028",
                  marginTop: 10,
                  lineHeight: 1.1,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: s.changeColor,
                  marginTop: 6,
                  fontWeight: 600,
                }}
              >
                {s.change}
              </div>
            </div>
          ))}
        </div>

        {/* Two columns */}
        <div
          className="grid gap-5 grid-cols-1 lg:grid-cols-5"
          style={{ padding: "0 32px 32px" }}
        >
          {/* Orders */}
          <div
            className="lg:col-span-3"
            style={{
              background: "#FFFFFF",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: 16,
                fontWeight: 700,
                color: "#1A3028",
                marginBottom: 14,
              }}
            >
              Последние заказы
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "#7A7A7A", textAlign: "left" }}>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>#</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Товар</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Сумма</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Доставка</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDERS.map((o) => (
                    <tr key={o.id} style={{ borderTop: "1px solid #F0F0F0", color: "#1A3028" }}>
                      <td style={{ padding: "12px 8px", fontWeight: 600 }}>{o.id}</td>
                      <td style={{ padding: "12px 8px" }}>{o.product}</td>
                      <td style={{ padding: "12px 8px", fontWeight: 600 }}>{o.sum}</td>
                      <td style={{ padding: "12px 8px", color: "#6B5E4E" }}>{o.delivery}</td>
                      <td style={{ padding: "12px 8px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 100,
                            fontSize: 11,
                            fontWeight: 600,
                            color: o.statusColor,
                            background: o.statusBg,
                          }}
                        >
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top products */}
          <div
            className="lg:col-span-2"
            style={{
              background: "#FFFFFF",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: 16,
                fontWeight: 700,
                color: "#1A3028",
                marginBottom: 14,
              }}
            >
              Хиты продаж
            </div>
            <div className="flex flex-col gap-3">
              {TOP.map((p) => (
                <div key={p.name}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                    <div className="flex items-center gap-2" style={{ fontSize: 13, color: "#1A3028" }}>
                      <span style={{ fontSize: 18 }}>{p.emoji}</span>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#7A7A7A", fontWeight: 600 }}>
                      {p.sold} шт
                    </div>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 100,
                      background: "#F0EDE5",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${p.pct}%`,
                        height: "100%",
                        background:
                          "linear-gradient(90deg, #C8973A 0%, #E8B84B 100%)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .admin-nav-item:hover {
          background: rgba(255,251,243,0.08) !important;
          color: rgba(255,251,243,0.9) !important;
        }
      `}</style>
    </div>
  );
}
