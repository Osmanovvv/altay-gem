import { motion } from "framer-motion";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import type { Product } from "@/data/products";
import { useCart } from "@/context/CartContext";

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  "Хит": { bg: "var(--color-accent)", color: "var(--color-bg-dark)" },
  "Новинка": { bg: "var(--color-success)", color: "#f5efe0" },
};

/** Скидочные бейджи приходят с сервера любым процентом («-13%»). */
const badgeStyle = (b: string) =>
  BADGE_STYLES[b] ??
  (b.startsWith("-")
    ? { bg: "var(--color-error)", color: "#f5efe0" }
    : { bg: "var(--color-accent)", color: "var(--color-bg-dark)" });

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

interface ProductCardProps {
  product: Product;
  onAdd?: (p: Product) => void;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const p = product;
  const { items, updateQuantity } = useCart();
  const cartItem = items.find((i) => i.product.id === p.id);
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      whileHover={{ y: -4 }}
      className="group flex flex-col overflow-hidden"
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 16,
        boxShadow: "var(--shadow-card)",
        border: "1px solid rgba(31,26,14,0.06)",
        transition: "var(--transition-smooth)",
        opacity: p.inStock ? 1 : 0.78,
      }}
    >
      <div
        className="relative"
        style={{
          aspectRatio: "1 / 1",
          background: p.image,
          overflow: "hidden",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 100% 0%, rgba(255,255,255,0.22), transparent 60%)",
          }}
        />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {p.badges.map((b) => (
            <span
              key={b}
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "5px 10px",
                borderRadius: 999,
                backgroundColor: badgeStyle(b).bg,
                color: badgeStyle(b).color,
                width: "fit-content",
              }}
            >
              {b}
            </span>
          ))}
        </div>
        {!p.inStock && (
          <span
            className="absolute right-3 top-3"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "5px 10px",
              borderRadius: 999,
              backgroundColor: "rgba(31,26,14,0.7)",
              color: "#f5efe0",
            }}
          >
            Нет в наличии
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <span
          className="self-start"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "4px 9px",
            borderRadius: 999,
            backgroundColor: "rgba(200,150,62,0.12)",
            color: "var(--color-accent-dark)",
          }}
        >
          {p.subcategory}
        </span>

        <h3
          className="mt-3"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.3,
            color: "var(--color-text)",
            minHeight: 40,
          }}
        >
          {p.name}
        </h3>
        <p
          style={{
            marginTop: 4,
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            lineHeight: 1.4,
            color: "var(--color-text-muted)",
          }}
        >
          {p.shortDescription}
        </p>

        <div className="mt-4 flex items-baseline gap-2">
          <span
            style={{
              fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
              fontSize: 22,
              color: p.oldPrice
                ? "var(--color-accent-dark)"
                : "var(--color-text)",
              lineHeight: 1,
            }}
          >
            {formatPrice(p.price)}
          </span>
          {p.oldPrice && (
            <span
              style={{
                fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
                fontSize: 13,
                color: "var(--color-text-muted)",
                textDecoration: "line-through",
              }}
            >
              {formatPrice(p.oldPrice)}
            </span>
          )}
          <span
            className="ml-auto"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            {p.unit}
          </span>
        </div>

        {cartItem ? (
          <div
            className="mt-auto inline-flex items-center justify-between rounded-full"
            style={{
              marginTop: 18,
              minHeight: 44,
              backgroundColor: "rgba(31,26,14,0.06)",
              padding: 3,
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                updateQuantity(p.id, cartItem.quantity - 1);
              }}
              disabled={cartItem.quantity <= 1}
              aria-label="Уменьшить количество"
              className="inline-flex items-center justify-center rounded-full disabled:opacity-40"
              style={{ width: 38, height: 38, color: "var(--color-text)" }}
            >
              <Minus size={16} />
            </button>
            <span
              className="text-center"
              style={{
                minWidth: 28,
                fontFamily: "var(--font-body)",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--color-text)",
              }}
            >
              {cartItem.quantity}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                updateQuantity(p.id, cartItem.quantity + 1);
              }}
              aria-label="Увеличить количество"
              className="inline-flex items-center justify-center rounded-full"
              style={{
                width: 38,
                height: 38,
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg-dark)",
              }}
            >
              <Plus size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAdd?.(p);
            }}
            disabled={!p.inStock}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-full"
            style={{
              marginTop: 18,
              backgroundColor: p.inStock
                ? "var(--color-accent)"
                : "rgba(31,26,14,0.1)",
              color: p.inStock ? "var(--color-bg-dark)" : "var(--color-text-muted)",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: 14,
              padding: "12px 18px",
              minHeight: 44,
              cursor: p.inStock ? "pointer" : "not-allowed",
              transition: "var(--transition-smooth)",
            }}
            onMouseEnter={(e) => {
              if (p.inStock)
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "var(--color-accent-light)";
            }}
            onMouseLeave={(e) => {
              if (p.inStock)
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "var(--color-accent)";
            }}
          >
            <ShoppingBag size={16} />
            {p.inStock ? "В корзину" : "Сообщить"}
          </button>
        )}
      </div>
    </motion.article>
  );
}

export default ProductCard;
