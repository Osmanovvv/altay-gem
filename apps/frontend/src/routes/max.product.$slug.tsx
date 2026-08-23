import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ChevronLeft, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { ApiError, fetchProduct, toProduct } from "@/lib/api";
import { discountPercent, strikePrice } from "@/lib/price-view";
import { PICKUP_POINTS } from "@/lib/checkout-rules";
import { readableCharacteristics } from "@/lib/characteristics";

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/** Карточка товара мини-аппа (ТЗ р.13). Данные — тот же /products/{slug}. */
export const Route = createFileRoute("/max/product/$slug")({
  loader: async ({ params }) => {
    try {
      const detail = await fetchProduct(params.slug);
      return { detail, product: toProduct(detail) };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw notFound();
      throw err;
    }
  },
  component: MaxProduct,
});

function MaxProduct() {
  const { detail, product: p } = Route.useLoaderData();
  const { items, addToCart, updateQuantity } = useCart();
  const inCart = items.find((i) => i.product.id === p.id);
  const oldPrice = strikePrice(p.price, p.oldPrice);
  const discount = discountPercent(p.price, p.oldPrice);
  const photo = detail.photos?.[0] ?? null;
  // Подписи характеристик — общий модуль с сайтом: сырые ключи Strapi
  // («storage») покупателю показывать нельзя.
  const characteristics = readableCharacteristics(detail.characteristics);

  return (
    <div style={{ paddingBottom: 150 }}>
      <div
        className="relative"
        style={{ aspectRatio: "1 / 1", background: p.image, overflow: "hidden" }}
      >
        {photo && (
          <img
            src={photo}
            alt={p.name}
            width={720}
            height={720}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
        <Link
          to="/max/catalog"
          aria-label="Назад в каталог"
          className="absolute inline-flex items-center justify-center rounded-full"
          style={{
            left: 12,
            top: 12,
            width: 38,
            height: 38,
            backgroundColor: "rgba(255,253,247,0.92)",
            color: "var(--color-text)",
            textDecoration: "none",
          }}
        >
          <ChevronLeft size={20} />
        </Link>
        {discount !== null && (
          <span
            className="absolute rounded-full px-2 py-1"
            style={{
              right: 12,
              top: 12,
              backgroundColor: "var(--color-error)",
              color: "#fff",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            −{discount}%
          </span>
        )}
      </div>

      <div className="px-4 pt-4">
        {p.subcategory && (
          <span
            className="inline-block rounded-full px-2.5 py-1"
            style={{
              backgroundColor: "rgba(200,150,62,0.12)",
              color: "var(--color-accent-dark)",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {p.subcategory}
          </span>
        )}

        <h1
          className="mt-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 600,
            color: "var(--color-text)",
            lineHeight: 1.1,
          }}
        >
          {p.name}
        </h1>

        <div className="mt-3 flex items-baseline gap-2">
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontVariantNumeric: "tabular-nums",
              fontSize: 28,
              fontWeight: 700,
              color: "var(--color-accent)",
            }}
          >
            {formatPrice(p.price)}
          </span>
          {oldPrice !== null && (
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontVariantNumeric: "tabular-nums",
                fontSize: 15,
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
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            / {p.unit}
          </span>
        </div>

        {p.shortDescription && (
          <p
            className="mt-3"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              lineHeight: 1.5,
              color: "var(--color-text-muted)",
            }}
          >
            {p.shortDescription}
          </p>
        )}

        {/* Наличие по точкам — то же правило, что на сайте: покупатель должен
            видеть, где товар реально лежит, ещё до выбора самовывоза. */}
        {detail.pickupAvailability && detail.pickupAvailability.length > 0 && (
          <div
            className="mt-4 rounded-2xl"
            style={{
              backgroundColor: "#fffdf7",
              border: "1px solid rgba(31,26,14,0.06)",
              padding: 12,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--color-text)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Самовывоз
            </p>
            {detail.pickupAvailability.map((a) => (
              <div key={a.point} className="mt-1.5 flex items-baseline justify-between gap-3">
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {PICKUP_POINTS[a.point].short}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: a.availableQty > 0 ? "var(--color-success)" : "var(--color-text-muted)",
                  }}
                >
                  {a.availableQty > 0 ? `${a.availableQty} ${p.unit}` : "нет"}
                </span>
              </div>
            ))}
          </div>
        )}

        {p.isPerishable && (
          <p
            className="mt-3 rounded-xl"
            style={{
              backgroundColor: "rgba(232,180,79,0.18)",
              color: "var(--color-accent-dark)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              padding: "10px 12px",
            }}
          >
            Скоропортящийся товар — доставка только по Новосибирску и самовывоз
          </p>
        )}

        {detail.fullDescription && (
          <p
            className="mt-4"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--color-text)",
              whiteSpace: "pre-line",
            }}
          >
            {detail.fullDescription}
          </p>
        )}

        {characteristics.length > 0 && (
          <div className="mt-5">
            <h2
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--color-text-muted)",
              }}
            >
              Характеристики
            </h2>
            <dl className="mt-2 flex flex-col gap-1.5">
              {characteristics.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {k}
                  </dt>
                  <dd
                    className="text-right"
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "var(--color-text)",
                    }}
                  >
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {/* Кнопка покупки закреплена над панелью вкладок: на длинной карточке
          иначе пришлось бы скроллить обратно наверх. */}
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
        {!p.inStock ? (
          <button
            type="button"
            disabled
            className="w-full rounded-full"
            style={{
              backgroundColor: "rgba(31,26,14,0.1)",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 15,
              minHeight: 48,
            }}
          >
            Нет в наличии
          </button>
        ) : inCart ? (
          <div className="flex items-center gap-3">
            <div
              className="inline-flex items-center rounded-full"
              style={{ backgroundColor: "rgba(31,26,14,0.06)", padding: 4 }}
            >
              <button
                type="button"
                onClick={() => updateQuantity(p.id, inCart.quantity - 1)}
                disabled={inCart.quantity <= 1}
                aria-label="Уменьшить количество"
                className="inline-flex items-center justify-center rounded-full disabled:opacity-40"
                style={{ width: 40, height: 40, color: "var(--color-text)" }}
              >
                <Minus size={16} />
              </button>
              <span
                className="text-center"
                style={{
                  minWidth: 28,
                  fontFamily: "var(--font-body)",
                  fontSize: 16,
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
                  width: 40,
                  height: 40,
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg-dark)",
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <Link
              to="/max/cart"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full"
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
              В корзину
            </Link>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => addToCart(p)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg-dark)",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 15,
              minHeight: 48,
            }}
          >
            <ShoppingBag size={17} />
            Добавить за {formatPrice(p.price)}
          </button>
        )}
      </div>
    </div>
  );
}
