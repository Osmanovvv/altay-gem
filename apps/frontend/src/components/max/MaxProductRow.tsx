import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import type { Product } from "@/data/products";
import { discountPercent, strikePrice } from "@/lib/price-view";

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/**
 * Строка товара для мини-аппа: горизонтальная карточка под узкий экран.
 * Правило показа старой цены и процента скидки — общее с сайтом
 * (lib/price-view), своей формулы здесь нет: иначе на витрине и в мини-аппе
 * покажется разная скидка на один товар.
 */
export function MaxProductRow({ product: p }: { product: Product }) {
  const { items, addToCart, updateQuantity } = useCart();
  const inCart = items.find((i) => i.product.id === p.id);
  const oldPrice = strikePrice(p.price, p.oldPrice);
  const discount = discountPercent(p.price, p.oldPrice);

  return (
    <article
      className="relative flex gap-3"
      style={{
        backgroundColor: "#fffdf7",
        border: "1px solid rgba(31,26,14,0.06)",
        borderRadius: 16,
        padding: 10,
        boxShadow: "var(--shadow-card)",
        opacity: p.inStock ? 1 : 0.75,
      }}
    >
      {/* Ссылка-накладка: по карточке можно нажать целиком, кнопки лежат выше. */}
      <Link
        to="/max/product/$slug"
        params={{ slug: p.id }}
        aria-label={`Открыть товар: ${p.name}`}
        className="absolute inset-0"
        style={{ zIndex: 1, borderRadius: 16 }}
      />

      <div
        className="relative shrink-0 overflow-hidden"
        style={{ width: 84, height: 84, borderRadius: 12, background: p.image }}
      >
        {discount !== null && (
          <span
            className="absolute left-1 top-1 rounded-full px-1.5"
            style={{
              backgroundColor: "var(--color-error)",
              color: "#fff",
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: 700,
              zIndex: 2,
            }}
          >
            −{discount}%
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3
          className="line-clamp-2"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text)",
            lineHeight: 1.25,
          }}
        >
          {p.name}
        </h3>

        <div className="mt-1 flex items-baseline gap-2">
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontVariantNumeric: "tabular-nums",
              fontSize: 17,
              fontWeight: 700,
              color: "var(--color-text)",
            }}
          >
            {formatPrice(p.price)}
          </span>
          {oldPrice !== null && (
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontVariantNumeric: "tabular-nums",
                fontSize: 12,
                color: "var(--color-text-muted)",
                textDecoration: "line-through",
              }}
            >
              {formatPrice(oldPrice)}
            </span>
          )}
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--color-text-muted)",
            }}
          >
            / {p.unit}
          </span>
        </div>

        <div className="relative mt-auto pt-2" style={{ zIndex: 2 }}>
          {!p.inStock ? (
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--color-text-muted)",
              }}
            >
              Нет в наличии
            </span>
          ) : inCart ? (
            <div
              className="inline-flex items-center gap-1 rounded-full"
              style={{ backgroundColor: "rgba(31,26,14,0.06)", padding: 3 }}
            >
              <button
                type="button"
                onClick={() => updateQuantity(p.id, inCart.quantity - 1)}
                disabled={inCart.quantity <= 1}
                aria-label="Уменьшить количество"
                className="inline-flex items-center justify-center rounded-full disabled:opacity-40"
                style={{ width: 32, height: 32, color: "var(--color-text)" }}
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
                {inCart.quantity}
              </span>
              <button
                type="button"
                onClick={() => updateQuantity(p.id, inCart.quantity + 1)}
                aria-label="Увеличить количество"
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg-dark)",
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => addToCart(p)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg-dark)",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 13,
                padding: "0 16px",
                minHeight: 36,
              }}
            >
              <ShoppingBag size={14} />В корзину
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default MaxProductRow;
