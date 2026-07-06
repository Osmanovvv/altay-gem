import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useCart, type CartItem } from "@/context/CartContext";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Корзина - Жемчужина Алтая" },
      {
        name: "description",
        content: "Ваша корзина с натуральной продукцией Алтая.",
      },
    ],
  }),
  component: CartPage,
});

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

function declension(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

function CartPage() {
  const {
    items,
    updateQuantity,
    removeFromCart,
    clearCart,
    getCartTotal,
    getCartDiscount,
    getCartCount,
    hasPerishable,
    promoCode,
    promoError,
    applyPromoCode,
    clearPromoCode,
    getPromoDiscount,
  } = useCart();
  const navigate = useNavigate();
  const goCheckout = () => navigate({ to: "/checkout" });

  const [toast, setToast] = useState<string | null>(null);
  const fireToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2000);
  };

  const count = getCartCount();
  const total = getCartTotal();
  const promoDiscount = getPromoDiscount();
  // getCartDiscount = скидки по старой цене + промокод вместе; в сводке
  // показываем их отдельными строками, поэтому вычитаем промо-часть.
  const discount = getCartDiscount() - promoDiscount;

  return (
    <div style={{ backgroundColor: "var(--color-bg-cream)", minHeight: "100vh" }}>
      <Header />

      <main className="pt-20 pb-32 md:pt-24 md:pb-16">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          {/* Heading */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--color-accent-dark)",
                }}
              >
                Оформление
              </span>
              <h1
                className="mt-2 text-4xl md:text-5xl"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  color: "var(--color-bg-dark)",
                  lineHeight: 1.05,
                }}
              >
                Корзина
              </h1>
            </div>
            {items.length > 0 && (
              <div className="flex items-center gap-4">
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {count} {declension(count, ["товар", "товара", "товаров"])}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clearCart();
                    fireToast("Корзина очищена");
                  }}
                  className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-[color:var(--color-error)]"
                  style={{
                    fontFamily: "var(--font-body)",
                    color: "var(--color-text-muted)",
                    fontWeight: 500,
                  }}
                >
                  <Trash2 size={14} />
                  Очистить
                </button>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
              {/* Items list */}
              <ul className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {items.map((it) => (
                    <CartItemRow
                      key={it.product.id}
                      item={it}
                      onQty={(q) => updateQuantity(it.product.id, q)}
                      onRemove={() => {
                        removeFromCart(it.product.id);
                        fireToast(`«${it.product.name}» удалён из корзины`);
                      }}
                    />
                  ))}
                </AnimatePresence>
              </ul>

              {/* Summary desktop */}
              <aside className="hidden lg:block">
                <div className="sticky top-24">
                  <Summary
                    total={total}
                    discount={discount}
                    count={count}
                    perishable={hasPerishable()}
                    onCheckout={goCheckout}
                    promoCode={promoCode}
                    promoError={promoError}
                    promoDiscount={promoDiscount}
                    onApplyPromo={applyPromoCode}
                    onClearPromo={clearPromoCode}
                  />
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>

      {/* Sticky mobile summary */}
      {items.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
          style={{
            backgroundColor: "rgba(255,253,247,0.97)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderColor: "rgba(31,26,14,0.08)",
            padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
            boxShadow: "0 -8px 28px rgba(26,42,32,0.12)",
          }}
        >
          {hasPerishable() && (
            <div
              className="mb-2 flex items-start gap-2 rounded-xl"
              style={{
                backgroundColor: "rgba(232,180,79,0.18)",
                color: "var(--color-accent-dark)",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 500,
                padding: "8px 12px",
              }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Есть товары с доставкой только по Новосибирску.
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
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
                  lineHeight: 1,
                }}
              >
                {formatPrice(total)}
              </span>
            </div>
            <button
              type="button"
              onClick={goCheckout}
              className="ml-auto inline-flex flex-1 items-center justify-center gap-2 rounded-full"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg-dark)",
                fontFamily: "var(--font-body)",
                fontWeight: 700,
                fontSize: 14,
                minHeight: 48,
                padding: "0 18px",
              }}
            >
              <ShoppingBag size={16} />
              Оформить
            </button>
          </div>
        </div>
      )}

      <Footer />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
            className="fixed left-1/2 z-50 -translate-x-1/2"
            style={{
              bottom: 96,
              backgroundColor: "var(--color-bg-dark)",
              color: "var(--color-text-on-dark)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 500,
              padding: "12px 20px",
              borderRadius: 999,
              boxShadow: "var(--shadow-elevated)",
              maxWidth: "calc(100% - 32px)",
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CartItemRow({
  item,
  onQty,
  onRemove,
}: {
  item: CartItem;
  onQty: (q: number) => void;
  onRemove: () => void;
}) {
  const { product, quantity } = item;
  const lineTotal = product.price * quantity;
  const oldLineTotal = product.oldPrice ? product.oldPrice * quantity : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25 }}
      className="group grid grid-cols-[80px_1fr] gap-3 transition-colors hover:bg-[color:var(--color-cart-hover,rgba(59,110,74,0.06))] md:grid-cols-[96px_1fr_auto] md:gap-4"
      style={
        {
          "--color-cart-hover": "rgba(59,110,74,0.06)",
          backgroundColor: "#fffdf7",
          border: "1px solid rgba(31,26,14,0.06)",
          borderRadius: 16,
          padding: 12,
          opacity: product.inStock ? 1 : 0.85,
        } as React.CSSProperties
      }
    >
      {/* Thumb */}
      <Link
        to="/product/$slug"
        params={{ slug: product.id }}
        className="relative block overflow-hidden"
        style={{
          aspectRatio: "1 / 1",
          borderRadius: 12,
          background: product.image,
        }}
        aria-label={product.name}
      />

      {/* Info */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span
          className="self-start"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-accent-dark)",
          }}
        >
          {product.categoryName || product.subcategory}
        </span>
        <Link
          to="/product/$slug"
          params={{ slug: product.id }}
          className="line-clamp-2"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--color-text)",
            textDecoration: "none",
          }}
        >
          {product.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span
            style={{
              fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            {formatPrice(product.price)} / {product.unit}
          </span>
          {!product.inStock && (
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 999,
                backgroundColor: "rgba(166,61,61,0.12)",
                color: "var(--color-error)",
              }}
            >
              Нет в наличии
            </span>
          )}
          {product.isPerishable && (
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: "var(--color-accent-dark)",
              }}
            >
              · только НСК
            </span>
          )}
        </div>

        {/* Mobile controls */}
        <div className="mt-2 flex items-center justify-between md:hidden">
          <QtyCounter qty={quantity} onChange={onQty} disabled={!product.inStock} />
          <div className="flex flex-col items-end">
            <span
              style={{
                fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
                fontSize: 18,
                color: "var(--color-text)",
                lineHeight: 1,
              }}
            >
              {formatPrice(lineTotal)}
            </span>
            {oldLineTotal && (
              <span
                style={{
                  fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  textDecoration: "line-through",
                }}
              >
                {formatPrice(oldLineTotal)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Desktop controls */}
      <div className="hidden items-center gap-4 md:flex">
        <QtyCounter qty={quantity} onChange={onQty} disabled={!product.inStock} />
        <div className="flex w-28 flex-col items-end">
          <span
            style={{
              fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              fontSize: 20,
              color: "var(--color-text)",
              lineHeight: 1,
            }}
          >
            {formatPrice(lineTotal)}
          </span>
          {oldLineTotal && (
            <span
              style={{
                fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
                fontSize: 12,
                color: "var(--color-text-muted)",
                textDecoration: "line-through",
              }}
            >
              {formatPrice(oldLineTotal)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Удалить из корзины"
          className="inline-flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
          style={{ width: 40, height: 40, color: "var(--color-text-muted)" }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Mobile remove */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Удалить из корзины"
        className="absolute inline-flex items-center justify-center rounded-full transition-colors hover:bg-black/5 md:hidden"
        style={{
          width: 32,
          height: 32,
          color: "var(--color-text-muted)",
          position: "relative",
          gridColumn: "2",
          justifySelf: "end",
          marginTop: -4,
          display: "none",
        }}
      >
        <X size={16} />
      </button>
    </motion.li>
  );
}

function QtyCounter({
  qty,
  onChange,
  disabled,
}: {
  qty: number;
  onChange: (q: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center"
      style={{
        borderRadius: 999,
        backgroundColor: "rgba(31,26,14,0.06)",
        padding: 3,
      }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, qty - 1))}
        disabled={disabled || qty <= 1}
        aria-label="Уменьшить"
        className="inline-flex items-center justify-center rounded-full disabled:opacity-40"
        style={{ width: 34, height: 34, color: "var(--color-text)" }}
      >
        <Minus size={14} />
      </button>
      <span
        className="text-center"
        style={{
          minWidth: 36,
          fontFamily: "var(--font-body)",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={disabled}
        aria-label="Увеличить"
        className="inline-flex items-center justify-center rounded-full disabled:opacity-40"
        style={{ width: 34, height: 34, color: "var(--color-text)" }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function Summary({
  total,
  discount,
  count,
  perishable,
  onCheckout,
  promoCode,
  promoError,
  promoDiscount,
  onApplyPromo,
  onClearPromo,
}: {
  total: number;
  discount: number;
  count: number;
  perishable: boolean;
  onCheckout: () => void;
  promoCode: string | null;
  promoError: string | null;
  promoDiscount: number;
  onApplyPromo: (code: string) => void;
  onClearPromo: () => void;
}) {
  const [promoInput, setPromoInput] = useState("");
  return (
    <div
      style={{
        backgroundColor: "#fffdf7",
        border: "1px solid rgba(31,26,14,0.06)",
        borderRadius: 20,
        padding: 24,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
          fontSize: 24,
          fontWeight: 600,
          color: "var(--color-text)",
          marginBottom: 16,
        }}
      >
        Ваш заказ
      </h2>

      <SummaryRow
        label={`Подытог (${count} шт)`}
        value={formatPrice(total + discount + promoDiscount)}
      />
      {discount > 0 && (
        <SummaryRow
          label="Скидка"
          value={`− ${formatPrice(discount)}`}
          accent="var(--color-error)"
        />
      )}
      {promoDiscount > 0 && (
        <SummaryRow
          label={`Промокод ${promoCode}`}
          value={`− ${formatPrice(promoDiscount)}`}
          accent="var(--color-error)"
        />
      )}

      {/* Промокод */}
      <div className="mt-3">
        {promoCode ? (
          <div
            className="flex items-center justify-between rounded-xl"
            style={{
              backgroundColor: "rgba(59,110,74,0.08)",
              padding: "10px 14px",
            }}
          >
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
                onClearPromo();
                setPromoInput("");
              }}
              aria-label="Убрать промокод"
              className="rounded-full transition-colors hover:bg-black/5"
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
                  if (e.key === "Enter") onApplyPromo(promoInput);
                }}
                placeholder="Промокод"
                className="w-full rounded-full border px-4 outline-none transition-colors focus:border-[color:var(--color-accent)]"
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
                onClick={() => onApplyPromo(promoInput)}
                className="shrink-0 rounded-full transition-colors"
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

      <hr style={{ borderColor: "rgba(31,26,14,0.08)", margin: "16px 0" }} />

      <div className="flex items-baseline justify-between">
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text)",
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
            fontSize: 32,
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
        onClick={onCheckout}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg-dark)",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          fontSize: 15,
          padding: "14px 22px",
          minHeight: 52,
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "var(--color-accent-light)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "var(--color-accent)")
        }
      >
        <ShoppingBag size={18} />
        Оформить заказ
      </button>

      {perishable && (
        <div
          className="mt-4 flex items-start gap-2 rounded-xl"
          style={{
            backgroundColor: "rgba(232,180,79,0.18)",
            color: "var(--color-accent-dark)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            lineHeight: 1.45,
            padding: "12px 14px",
          }}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Часть товаров доставляется только по Новосибирску. Проверьте адрес доставки при оформлении.
          </span>
        </div>
      )}

      <Link
        to="/catalog"
        className="mt-4 block text-center transition-colors hover:text-[color:var(--color-accent-dark)]"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--color-text-muted)",
          textDecoration: "none",
        }}
      >
        ← Продолжить покупки
      </Link>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          fontWeight: 600,
          color: accent ?? "var(--color-text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyCart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mx-auto mt-10 flex max-w-md flex-col items-center text-center"
      style={{
        backgroundColor: "#fffdf7",
        border: "1px dashed rgba(31,26,14,0.15)",
        borderRadius: 24,
        padding: "56px 24px",
      }}
    >
      <div
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 84,
          height: 84,
          backgroundColor: "rgba(200,150,62,0.12)",
          color: "var(--color-accent-dark)",
        }}
      >
        <ShoppingCart size={36} />
      </div>
      <h3
        className="mt-5"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 600,
          color: "var(--color-bg-dark)",
        }}
      >
        В корзине пока пусто
      </h3>
      <p
        className="mt-2"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 15,
          color: "var(--color-text-muted)",
          lineHeight: 1.5,
        }}
      >
        Самое время выбрать что-то вкусное!
      </p>
      <Link
        to="/catalog"
        className="mt-6 inline-flex items-center gap-2 rounded-full"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg-dark)",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          fontSize: 14,
          padding: "12px 24px",
          textDecoration: "none",
        }}
      >
        <ShoppingBag size={16} />
        Перейти в каталог
      </Link>
    </motion.div>
  );
}
