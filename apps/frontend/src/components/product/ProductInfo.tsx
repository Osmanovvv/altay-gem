import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Minus, Plus, ShoppingBag, Truck } from "lucide-react";
import type { Product } from "@/data/products";
import { CATEGORIES } from "@/data/categories";

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  "Хит": { bg: "var(--color-accent)", color: "var(--color-bg-dark)" },
  "Новинка": { bg: "var(--color-success)", color: "#f5efe0" },
  "-15%": { bg: "var(--color-error)", color: "#f5efe0" },
  "-20%": { bg: "var(--color-error)", color: "#f5efe0" },
};

const SPECS_BY_CATEGORY: Record<string, Record<string, string>> = {
  honey: {
    Состав: "100% натуральный мёд, без добавок",
    Производитель: "Пасеки Алтайская деревня",
    "Срок годности": "24 месяца",
    "Условия хранения": "При температуре до +20°C, в тёмном месте",
  },
  tea: {
    Состав: "Натуральные травы и листья ручного сбора",
    Производитель: "Шлегель, с. Алтайское",
    "Срок годности": "18 месяцев",
    "Условия хранения": "В сухом месте, в герметичной упаковке",
  },
  cheese: {
    Состав: "Молоко цельное пастеризованное, соль, закваска",
    Производитель: "Сыроварня Алтайская деревня",
    "Срок годности": "30 суток",
    "Условия хранения": "При температуре +2…+6°C",
  },
  meat: {
    Состав: "Мясо марала/оленя, соль, специи натуральные",
    Производитель: "Хозяйство Шлегель",
    "Срок годности": "60 суток",
    "Условия хранения": "При температуре +2…+6°C",
  },
  cosmetics: {
    Состав: "Растительные масла Алтая, экстракты трав, без парабенов",
    Производитель: "Алтайская деревня",
    "Срок годности": "12 месяцев",
    "Условия хранения": "При температуре +5…+25°C",
  },
  balms: {
    Состав: "Травяной экстракт, натуральные масла холодного отжима",
    Производитель: "Шлегель",
    "Срок годности": "24 месяца",
    "Условия хранения": "В тёмном прохладном месте",
  },
  pantohematogen: {
    Состав: "Кровь пантов марала, натуральные компоненты",
    Производитель: "Алтайская деревня",
    "Срок годности": "18 месяцев",
    "Условия хранения": "В тёмном прохладном месте",
  },
  gifts: {
    Состав: "Подарочная упаковка, см. описание",
    Производитель: "Жемчужина Алтая",
    "Срок годности": "12 месяцев",
    "Условия хранения": "В сухом прохладном месте",
  },
};

const STOCK_BY_PRODUCT: Record<string, number> = {};
const stockFor = (id: string, inStock: boolean) => {
  if (!inStock) return 0;
  if (STOCK_BY_PRODUCT[id]) return STOCK_BY_PRODUCT[id];
  const code = id.charCodeAt(id.length - 1) + id.charCodeAt(id.length - 2);
  const value = 5 + (code % 12);
  STOCK_BY_PRODUCT[id] = value;
  return value;
};

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

interface ProductInfoProps {
  product: Product;
  onAdd: (p: Product, qty: number) => void;
}

export function ProductInfo({ product, onAdd }: ProductInfoProps) {
  const stock = stockFor(product.id, product.inStock);
  const [qty, setQty] = useState(1);
  const category = CATEGORIES.find((c) => c.id === product.category);

  const specs: Record<string, string> = {
    "Вес/Объём": product.unit,
    ...SPECS_BY_CATEGORY[product.category],
  };

  const longDesc =
    `${product.shortDescription}. ` +
    "Произведено по традиционным алтайским рецептам с соблюдением всех технологических норм. " +
    "Без искусственных консервантов, красителей и ароматизаторов. " +
    "Каждая партия проходит контроль качества в собственной лаборатории хозяйства.";

  return (
    <div className="flex flex-col gap-5">
      {/* Category chips */}
      <div className="flex flex-wrap items-center gap-2">
        {category && (
          <Link
            to="/catalog"
            className="rounded-full transition-colors hover:bg-black/5"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--color-accent-dark)",
              backgroundColor: "rgba(200,150,62,0.12)",
              padding: "5px 11px",
            }}
          >
            {category.name}
          </Link>
        )}
        <Link
          to="/catalog"
          className="rounded-full transition-colors hover:bg-black/5"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            backgroundColor: "rgba(31,26,14,0.05)",
            padding: "5px 11px",
          }}
        >
          {product.subcategory}
        </Link>
      </div>

      <h1
        className="text-3xl md:text-5xl"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          color: "var(--color-bg-dark)",
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
        }}
      >
        {product.name}
      </h1>

      {product.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {product.badges.map((b) => (
            <span
              key={b}
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "5px 11px",
                borderRadius: 999,
                backgroundColor: BADGE_STYLES[b]?.bg ?? "var(--color-accent)",
                color: BADGE_STYLES[b]?.color ?? "var(--color-bg-dark)",
              }}
            >
              {b}
            </span>
          ))}
        </div>
      )}

      {/* Price */}
      <div className="flex flex-wrap items-baseline gap-3">
        <span
          style={{
            fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
            fontSize: 40,
            lineHeight: 1,
            color: "var(--color-accent)",
          }}
        >
          {formatPrice(product.price)}
        </span>
        {product.oldPrice && (
          <span
            style={{
              fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
              fontSize: 18,
              color: "var(--color-text-muted)",
              textDecoration: "line-through",
            }}
          >
            {formatPrice(product.oldPrice)}
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--color-text-muted)",
          }}
        >
          за {product.unit}
        </span>
      </div>

      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--color-text-muted)",
        }}
      >
        {longDesc}
      </p>

      {/* Delivery badge */}
      <div
        className="inline-flex w-fit items-center gap-2 rounded-full"
        style={{
          padding: "10px 16px",
          backgroundColor: product.isPerishable
            ? "rgba(166,61,61,0.08)"
            : "rgba(59,110,74,0.1)",
          color: product.isPerishable
            ? "var(--color-error)"
            : "var(--color-success)",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {product.isPerishable ? <MapPin size={16} /> : <Truck size={16} />}
        {product.isPerishable
          ? "Доставка только по Новосибирску"
          : "Доставка по России"}
      </div>

      {/* Specs table */}
      <div
        className="overflow-hidden"
        style={{
          borderRadius: 16,
          border: "1px solid rgba(31,26,14,0.08)",
          backgroundColor: "#fffdf7",
        }}
      >
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {Object.entries(specs).map(([k, v], i) => (
              <tr
                key={k}
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid rgba(31,26,14,0.06)",
                }}
              >
                <td
                  className="align-top"
                  style={{
                    padding: "12px 16px",
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    width: "40%",
                  }}
                >
                  {k}
                </td>
                <td
                  style={{
                    padding: "12px 16px",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--color-text)",
                  }}
                >
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Counter + CTA */}
      <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-center">
        <QtyCounter qty={qty} setQty={setQty} max={stock} disabled={!product.inStock} />
        <AddButton
          disabled={!product.inStock}
          onClick={() => onAdd(product, qty)}
          fullWidth
        />
      </div>

      {/* Mobile counter (sticky CTA renders separately at page level) */}
      <div className="flex flex-col gap-3 md:hidden">
        <QtyCounter qty={qty} setQty={setQty} max={stock} disabled={!product.inStock} />
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--color-text-muted)",
          }}
        >
          {product.inStock ? `В наличии: ${stock} ${product.unit}` : "Сейчас нет в наличии"}
        </span>
      </div>

      {/* Hidden helper exposing current qty to sticky bar via custom event */}
      <MobileQtySync qty={qty} />
    </div>
  );
}

function QtyCounter({
  qty,
  setQty,
  max,
  disabled,
}: {
  qty: number;
  setQty: (n: number) => void;
  max: number;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center"
      style={{
        borderRadius: 999,
        backgroundColor: "rgba(31,26,14,0.06)",
        padding: 4,
        width: "fit-content",
      }}
    >
      <button
        type="button"
        onClick={() => setQty(Math.max(1, qty - 1))}
        disabled={disabled || qty <= 1}
        aria-label="Уменьшить"
        className="inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40"
        style={{
          width: 40,
          height: 40,
          backgroundColor: "transparent",
          color: "var(--color-text)",
        }}
      >
        <Minus size={16} />
      </button>
      <span
        className="text-center"
        style={{
          minWidth: 48,
          fontFamily: "var(--font-body)",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={() => setQty(Math.min(max || 1, qty + 1))}
        disabled={disabled || qty >= max}
        aria-label="Увеличить"
        className="inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40"
        style={{
          width: 40,
          height: 40,
          backgroundColor: "transparent",
          color: "var(--color-text)",
        }}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function AddButton({
  disabled,
  onClick,
  fullWidth,
}: {
  disabled?: boolean;
  onClick: () => void;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full ${fullWidth ? "w-full" : ""}`}
      style={{
        backgroundColor: disabled ? "rgba(31,26,14,0.1)" : "var(--color-accent)",
        color: disabled ? "var(--color-text-muted)" : "var(--color-bg-dark)",
        fontFamily: "var(--font-body)",
        fontWeight: 700,
        fontSize: 15,
        padding: "14px 28px",
        minHeight: 52,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "var(--transition-smooth)",
        flex: fullWidth ? 1 : undefined,
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "var(--color-accent-light)";
      }}
      onMouseLeave={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "var(--color-accent)";
      }}
    >
      <ShoppingBag size={18} />
      {disabled ? "Сообщить о поступлении" : "Добавить в корзину"}
    </button>
  );
}

// Bridges current qty to the sticky mobile CTA via window event.
function MobileQtySync({ qty }: { qty: number }) {
  if (typeof window !== "undefined") {
    (window as unknown as { __productQty?: number }).__productQty = qty;
  }
  return null;
}

export default ProductInfo;
