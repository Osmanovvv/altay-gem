import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Minus, Plus, ShoppingBag, X } from "lucide-react";

import { useCart } from "@/context/CartContext";
import { strikePrice } from "@/lib/price-view";

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/**
 * Корзина мини-аппа (ТЗ р.13). Хранилище общее с сайтом (CartContext), скидки
 * и промокод считаются той же логикой — иначе итог в мини-аппе и на сайте
 * разошёлся бы на одной и той же корзине.
 */
export const Route = createFileRoute("/max/cart")({
  component: MaxCart,
});

function MaxCart() {
  const {
    items,
    updateQuantity,
    removeFromCart,
    clearCart,
    getCartTotal,
    getCartCount,
    getPromoDiscount,
    hasPerishable,
    promoCode,
    promoError,
    applyPromoCode,
    clearPromoCode,
    ready,
  } = useCart();
  const navigate = useNavigate();
  const [promoInput, setPromoInput] = useState("");

  const total = getCartTotal();
  const promoDiscount = getPromoDiscount();
  const count = getCartCount();

  if (ready && items.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 pb-6 pt-16 text-center">
        <ShoppingBag size={40} style={{ color: "var(--color-text-muted)", opacity: 0.5 }} />
        <h1
          className="mt-4"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Корзина пуста
        </h1>
        <p
          className="mt-1"
          style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--color-text-muted)" }}
        >
          Загляните в каталог — там есть что выбрать
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
    <div className="px-4 pb-40 pt-4">
      <div className="flex items-baseline justify-between">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Корзина
        </h1>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            Очистить
          </button>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {items.map((it) => {
          const p = it.product;
          const lineTotal = p.price * it.quantity;
          const oldUnit = strikePrice(p.price, p.oldPrice);
          return (
            <li
              key={p.id}
              className="flex gap-3"
              style={{
                backgroundColor: "#fffdf7",
                border: "1px solid rgba(31,26,14,0.06)",
                borderRadius: 16,
                padding: 10,
              }}
            >
              <Link
                to="/max/product/$slug"
                params={{ slug: p.id }}
                aria-label={p.name}
                className="block shrink-0 overflow-hidden"
                style={{ width: 72, height: 72, borderRadius: 12, background: p.image }}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/max/product/$slug"
                    params={{ slug: p.id }}
                    className="line-clamp-2"
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--color-text)",
                      textDecoration: "none",
                      lineHeight: 1.25,
                    }}
                  >
                    {p.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeFromCart(p.id)}
                    aria-label="Удалить из корзины"
                    className="inline-flex shrink-0 items-center justify-center rounded-full"
                    style={{ width: 30, height: 30, color: "var(--color-text-muted)" }}
                  >
                    <X size={15} />
                  </button>
                </div>

                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {formatPrice(p.price)} / {p.unit}
                  {p.isPerishable && " · только НСК"}
                </span>

                <div className="mt-2 flex items-center justify-between">
                  <div
                    className="inline-flex items-center rounded-full"
                    style={{ backgroundColor: "rgba(31,26,14,0.06)", padding: 3 }}
                  >
                    <button
                      type="button"
                      onClick={() => updateQuantity(p.id, it.quantity - 1)}
                      disabled={it.quantity <= 1}
                      aria-label="Уменьшить количество"
                      className="inline-flex items-center justify-center rounded-full disabled:opacity-40"
                      style={{ width: 30, height: 30, color: "var(--color-text)" }}
                    >
                      <Minus size={14} />
                    </button>
                    <span
                      className="text-center"
                      style={{
                        minWidth: 22,
                        fontFamily: "var(--font-body)",
                        fontSize: 14,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {it.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(p.id, it.quantity + 1)}
                      aria-label="Увеличить количество"
                      className="inline-flex items-center justify-center rounded-full"
                      style={{
                        width: 30,
                        height: 30,
                        backgroundColor: "var(--color-accent)",
                        color: "var(--color-bg-dark)",
                      }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="flex flex-col items-end">
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
                        fontSize: 16,
                        fontWeight: 700,
                        color: "var(--color-text)",
                      }}
                    >
                      {formatPrice(lineTotal)}
                    </span>
                    {oldUnit !== null && (
                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                          textDecoration: "line-through",
                        }}
                      >
                        {formatPrice(oldUnit * it.quantity)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Промокод. На сайте это поле однажды оказалось спрятано в десктопном
          блоке — здесь оно в общем потоке, доступно всегда. */}
      <div
        className="mt-3"
        style={{
          backgroundColor: "#fffdf7",
          border: "1px solid rgba(31,26,14,0.06)",
          borderRadius: 16,
          padding: 12,
        }}
      >
        {promoCode ? (
          <div className="flex items-center justify-between">
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-success)",
              }}
            >
              Промокод {promoCode} применён
            </span>
            <button
              type="button"
              onClick={() => {
                clearPromoCode();
                setPromoInput("");
              }}
              aria-label="Убрать промокод"
              className="inline-flex items-center justify-center rounded-full"
              style={{ width: 28, height: 28, color: "var(--color-text-muted)" }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyPromoCode(promoInput);
                }}
                placeholder="Промокод"
                aria-label="Промокод"
                className="w-full rounded-full border px-4 outline-none focus:border-[color:var(--color-accent)]"
                style={{
                  borderColor: "rgba(31,26,14,0.15)",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  minHeight: 40,
                  backgroundColor: "#fff",
                }}
              />
              <button
                type="button"
                onClick={() => applyPromoCode(promoInput)}
                className="shrink-0 rounded-full"
                style={{
                  backgroundColor: "var(--color-bg-dark)",
                  color: "var(--color-accent)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 600,
                  fontSize: 13,
                  padding: "0 16px",
                  minHeight: 40,
                }}
              >
                Применить
              </button>
            </div>
            {promoError && (
              <p
                className="mt-1.5"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "var(--color-error)",
                }}
              >
                {promoError}
              </p>
            )}
          </>
        )}
      </div>

      {hasPerishable() && (
        <div
          className="mt-3 flex items-start gap-2 rounded-xl"
          style={{
            backgroundColor: "rgba(232,180,79,0.18)",
            color: "var(--color-accent-dark)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            padding: "10px 12px",
          }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Есть товары с доставкой только по Новосибирску
        </div>
      )}

      {/* Итог и переход к оформлению — над панелью вкладок */}
      <div
        className="fixed inset-x-0 z-40 px-4 py-3"
        style={{
          bottom: "calc(62px + env(safe-area-inset-bottom))",
          backgroundColor: "rgba(255,253,247,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderTop: "1px solid rgba(31,26,14,0.08)",
        }}
      >
        {promoDiscount > 0 && (
          <div className="mb-1.5 flex items-baseline justify-between">
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                color: "var(--color-text-muted)",
              }}
            >
              Скидка по промокоду
            </span>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-error)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              − {formatPrice(promoDiscount)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Итого
            </span>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontVariantNumeric: "tabular-nums",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--color-accent)",
                lineHeight: 1,
              }}
            >
              {formatPrice(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void navigate({ to: "/max/checkout" })}
            className="ml-auto inline-flex flex-1 items-center justify-center gap-2 rounded-full"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg-dark)",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 15,
              minHeight: 48,
              padding: "0 18px",
            }}
          >
            Оформить · {count}
          </button>
        </div>
      </div>
    </div>
  );
}
