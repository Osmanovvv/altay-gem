import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, LayoutGrid, ShoppingBag, Store } from "lucide-react";
import type { ReactNode } from "react";
import { useCart } from "@/context/CartContext";
import { MAX_TABS } from "@/lib/max-app";

const ICONS: Record<string, typeof Store> = {
  Витрина: Store,
  Каталог: LayoutGrid,
  Корзина: ShoppingBag,
  Заказ: ClipboardList,
};

/** Высота панели без учёта «шторки» телефона — на неё сдвигается контент. */
const TAB_BAR_H = 62;

/**
 * Оболочка мини-приложения MAX (ТЗ р.13): нижняя панель вкладок вместо шапки
 * и подвала сайта. Приложение живёт внутри окна мессенджера, поэтому своей
 * «шапки» у него нет — сверху уже есть интерфейс MAX.
 *
 * env(safe-area-inset-bottom) — под жест-бар iPhone: без него панель
 * налезает на системную полоску и по нижним вкладкам нельзя попасть.
 */
export function MaxShell({ children }: { children: ReactNode }) {
  const { getCartCount } = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const count = getCartCount();

  return (
    <div
      style={{
        backgroundColor: "var(--color-bg-cream)",
        minHeight: "100vh",
        paddingBottom: `calc(${TAB_BAR_H}px + env(safe-area-inset-bottom))`,
      }}
    >
      <main>{children}</main>

      <nav
        aria-label="Разделы приложения"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4"
        style={{
          backgroundColor: "rgba(255,253,247,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderTop: "1px solid rgba(31,26,14,0.08)",
          paddingBottom: "env(safe-area-inset-bottom)",
          boxShadow: "0 -6px 24px rgba(26,42,32,0.10)",
        }}
      >
        {MAX_TABS.map((tab) => {
          const Icon = ICONS[tab.label] ?? Store;
          const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-1"
              style={{
                minHeight: TAB_BAR_H,
                textDecoration: "none",
                color: active ? "var(--color-accent-dark)" : "var(--color-text-muted)",
                fontFamily: "var(--font-body)",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
              }}
            >
              <span className="relative inline-flex">
                <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                {tab.showsCartCount && count > 0 && (
                  <span
                    aria-hidden
                    className="absolute inline-flex items-center justify-center rounded-full"
                    style={{
                      top: -6,
                      right: -9,
                      minWidth: 17,
                      height: 17,
                      padding: "0 4px",
                      backgroundColor: "var(--color-accent)",
                      color: "var(--color-bg-dark)",
                      fontSize: 10,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {count}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default MaxShell;
