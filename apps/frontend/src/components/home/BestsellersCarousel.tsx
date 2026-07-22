import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import type { Product } from "@/data/products";
import { gradientFor, toProduct, type ApiCard } from "@/lib/api";

/** Карточка карусели хитов; собирается из ApiCard (/home.hits). */
interface Bestseller {
  id: string;
  name: string;
  category: string;
  weight: string;
  price: number;
  oldPrice?: number;
  image: string;
  imageAlt: string;
  imageFallback: string;
  badge?: string;
}

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  Хит: { bg: "var(--color-accent)", color: "var(--color-bg-dark)" },
  Новинка: { bg: "var(--color-success)", color: "#f5efe0" },
  "-15%": { bg: "var(--color-error)", color: "#f5efe0" },
  "-20%": { bg: "var(--color-error)", color: "#f5efe0" },
};

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

interface BestsellersCarouselProps {
  /** Хиты продаж из админки (/home.hits). */
  items: ApiCard[];
}

export function BestsellersCarousel({ items: hitCards }: BestsellersCarouselProps) {
  const BESTSELLERS: Bestseller[] = hitCards.map((c) => ({
    id: c.slug,
    name: c.name,
    category: c.categoryName ?? "",
    weight: c.unit,
    price: c.priceRub,
    oldPrice: c.oldPriceRub ?? undefined,
    image: c.photo ?? "",
    imageAlt: c.name,
    imageFallback: gradientFor(c.categorySlug),
    badge: c.badges[0],
  }));
  const cardBySlug = new Map(hitCards.map((c) => [c.slug, c]));
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateArrows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const { items, addToCart, updateQuantity } = useCart();

  // Бестселлеры и каталог — два независимых источника данных с разными id,
  // поэтому для корзины собираем Product-совместимый объект на лету.
  const toCartProduct = (b: Bestseller): Product => {
    const card = cardBySlug.get(b.id);
    if (card) return toProduct(card);
    return legacyToCartProduct(b);
  };
  const legacyToCartProduct = (b: Bestseller): Product => ({
    id: b.id,
    name: b.name,
    category: "bestseller",
    categoryName: b.category,
    subcategory: b.category,
    price: b.price,
    oldPrice: b.oldPrice ?? null,
    unit: b.weight,
    inStock: true,
    isPerishable: false,
    badges: b.badge ? [b.badge] : [],
    image: `url(${b.image}) center/cover no-repeat`,
    shortDescription: b.category,
  });

  return (
    <section
      id="bestsellers"
      style={{
        backgroundColor: "var(--color-bg-cream)",
        padding: "80px 0 96px",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
          <div>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-accent-dark)",
              }}
            >
              Бестселлеры
            </span>
            <h2
              className="mt-2 text-4xl md:text-5xl"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color: "var(--color-accent)",
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
              }}
            >
              Хиты продаж
            </h2>
          </div>

          <div className="hidden gap-2 md:flex">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              disabled={!canPrev}
              aria-label="Предыдущие товары"
              className="inline-flex items-center justify-center rounded-full border transition-all"
              style={{
                width: 44,
                height: 44,
                borderColor: "var(--color-accent)",
                color: "var(--color-accent-dark)",
                backgroundColor: "transparent",
                opacity: canPrev ? 1 : 0.35,
                cursor: canPrev ? "pointer" : "not-allowed",
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              disabled={!canNext}
              aria-label="Следующие товары"
              className="inline-flex items-center justify-center rounded-full transition-all"
              style={{
                width: 44,
                height: 44,
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg-dark)",
                opacity: canNext ? 1 : 0.35,
                cursor: canNext ? "pointer" : "not-allowed",
              }}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="bs-scroller flex gap-5 overflow-x-auto pb-4"
          style={{
            scrollSnapType: "x mandatory",
            scrollPaddingLeft: 16,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {BESTSELLERS.map((p, idx) => {
            const discount = p.oldPrice
              ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100)
              : 0;
            const badge = p.badge;
            return (
              <motion.article
                key={p.id}
                data-card
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: Math.min(idx, 4) * 0.05 }}
                className="bs-card group flex shrink-0 flex-col overflow-hidden"
                style={{
                  width: "calc((100% - 16px) / 1.5)",
                  maxWidth: 320,
                  scrollSnapAlign: "start",
                  backgroundColor: "#ffffff",
                  borderRadius: 16,
                  boxShadow: "var(--shadow-card)",
                  border: "1px solid rgba(31,26,14,0.06)",
                  transition: "var(--transition-smooth)",
                }}
              >
                <div
                  className="relative"
                  style={{
                    aspectRatio: "1 / 1",
                    background: p.imageFallback,
                    overflow: "hidden",
                  }}
                >
                  {p.image && (
                    <img
                      src={p.image}
                      alt={p.imageAlt}
                      width={640}
                      height={640}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(31,26,14,0.16), transparent 56%), radial-gradient(80% 60% at 100% 0%, rgba(255,255,255,0.18), transparent 60%)",
                    }}
                  />
                  {badge && (
                    <span
                      className="absolute left-3 top-3"
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "5px 10px",
                        borderRadius: 999,
                        backgroundColor: (
                          BADGE_STYLES[badge] ?? { bg: "var(--color-error)", color: "#f5efe0" }
                        ).bg,
                        color: (
                          BADGE_STYLES[badge] ?? { bg: "var(--color-error)", color: "#f5efe0" }
                        ).color,
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col p-4 md:p-5">
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
                    {p.category}
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
                  <span
                    style={{
                      marginTop: 4,
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {p.weight}
                  </span>

                  {/* Фиксированная высота строки цены — карточки с/без скидки не должны
                      "прыгать" по-разному, поэтому бейдж скидки всегда в этой же строке. */}
                  <div className="mt-4 flex flex-wrap items-center gap-2" style={{ minHeight: 30 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        fontSize: 24,
                        color: p.oldPrice ? "var(--color-accent-dark)" : "var(--color-text)",
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
                    {discount > 0 && (
                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 999,
                          backgroundColor: "var(--color-error)",
                          color: "#fff",
                        }}
                      >
                        −{discount}%
                      </span>
                    )}
                  </div>

                  {(() => {
                    const cartItem = items.find((i) => i.product.id === p.id);
                    if (cartItem) {
                      return (
                        <div
                          className="mt-auto inline-flex items-center justify-between rounded-full"
                          style={{
                            marginTop: 20,
                            minHeight: 44,
                            backgroundColor: "rgba(31,26,14,0.06)",
                            padding: 3,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => updateQuantity(p.id, cartItem.quantity - 1)}
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
                            onClick={() => updateQuantity(p.id, cartItem.quantity + 1)}
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
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => addToCart(toCartProduct(p))}
                        className="bs-cta mt-auto inline-flex items-center justify-center gap-2 rounded-full"
                        style={{
                          marginTop: 20,
                          backgroundColor: "var(--color-accent)",
                          color: "var(--color-bg-dark)",
                          fontFamily: "var(--font-body)",
                          fontWeight: 600,
                          fontSize: 14,
                          padding: "12px 18px",
                          minHeight: 44,
                          transition: "var(--transition-smooth)",
                        }}
                      >
                        <ShoppingBag size={16} />В корзину
                      </button>
                    );
                  })()}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>

      <style>{`
        .bs-scroller { scrollbar-width: thin; scrollbar-color: rgba(200,150,62,0.4) transparent; }
        .bs-scroller::-webkit-scrollbar { height: 6px; }
        .bs-scroller::-webkit-scrollbar-thumb { background: rgba(200,150,62,0.4); border-radius: 999px; }
        .bs-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-elevated); }
        .bs-cta:hover { background-color: var(--color-accent-light); }

        @media (min-width: 768px) {
          .bs-card { width: calc((100% - 40px) / 3) !important; }
        }
        @media (min-width: 1024px) {
          .bs-card { width: calc((100% - 60px) / 4) !important; }
        }
      `}</style>
    </section>
  );
}

export default BestsellersCarousel;
