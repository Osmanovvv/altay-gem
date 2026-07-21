import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Minus, Plus, ShoppingBag, Truck } from "lucide-react";
import type { Product } from "@/data/products";

/** Данные карточки, приходящие из API (характеристики, остаток, описание). */
export interface ProductInfoDetail {
  specs: Record<string, string>;
  stock: number;
  longDesc: string;
  categoryName: string | null;
  pickupAvailability?: Array<{
    point: "pickup_leningradskaya" | "pickup_titova";
    availableQty: number;
  }>;
}

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  "Хит": { bg: "var(--color-accent)", color: "var(--color-bg-dark)" },
  "Новинка": { bg: "var(--color-success)", color: "#f5efe0" },
};
const badgeStyle = (b: string) =>
  BADGE_STYLES[b] ??
  (b.startsWith("-")
    ? { bg: "var(--color-error)", color: "#f5efe0" }
    : { bg: "var(--color-accent)", color: "var(--color-bg-dark)" });

// Адреса точек самовывоза (синхронизированы с чекаутом)
const PICKUP_POINT_ADDRESS: Record<string, string> = {
  pickup_leningradskaya: "Ленинградская 75/2",
  pickup_titova: "Титова 32",
};



const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

interface ProductInfoProps {
  product: Product;
  detail: ProductInfoDetail;
  onAdd: (p: Product, qty: number) => void;
}

export function ProductInfo({ product, detail, onAdd }: ProductInfoProps) {
  const stock = product.inStock ? detail.stock : 0;
  const pickupAvailability = detail.pickupAvailability ?? [];
  const [qty, setQty] = useState(1);

  const specs: Record<string, string> = {
    "Вес/Объём": product.unit,
    ...detail.specs,
  };

  const longDesc = detail.longDesc || product.shortDescription;

  return (
    <div className="flex flex-col gap-5">
      {/* Category chips */}
      <div className="flex flex-wrap items-center gap-2">
        {detail.categoryName && (
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
            {detail.categoryName}
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
                backgroundColor: badgeStyle(b).bg,
                color: badgeStyle(b).color,
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

      {/* Наличие по точкам самовывоза (#37): честно, из тех же данных, что заказ */}
      {pickupAvailability.length > 0 && (
        <div
          className="flex flex-col gap-1.5 rounded-2xl"
          style={{ backgroundColor: "rgba(31,26,14,0.04)", padding: "12px 16px" }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            Самовывоз
          </span>
          {pickupAvailability.map((pa) => (
            <span
              key={pa.point}
              className="inline-flex items-center gap-1.5"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color:
                  pa.availableQty > 0
                    ? "var(--color-text)"
                    : "var(--color-text-muted)",
              }}
            >
              <MapPin
                size={14}
                style={{
                  color:
                    pa.availableQty > 0
                      ? "var(--color-success)"
                      : "var(--color-text-muted)",
                  flexShrink: 0,
                }}
              />
              {PICKUP_POINT_ADDRESS[pa.point] ?? pa.point} —{" "}
              {pa.availableQty > 0
                ? `${pa.availableQty} ${product.unit}`
                : "нет в наличии"}
            </span>
          ))}
        </div>
      )}

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
