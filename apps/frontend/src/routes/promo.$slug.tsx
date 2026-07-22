import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useRef } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/info/PageHero";

import { ApiError, fetchPromo, toPromo, toProduct, type FrontPromo } from "@/lib/api";
import { ProductCard } from "@/components/catalog/ProductCard";
import { useCart } from "@/context/CartContext";

export const Route = createFileRoute("/promo/$slug")({
  head: ({ loaderData }) => {
    const promo = (loaderData as { promo?: FrontPromo } | undefined)?.promo;
    const title = promo ? `${promo.title} - Жемчужина Алтая` : "Акция - Жемчужина Алтая";
    const description = promo?.description ?? "Подробности акции.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  loader: async ({ params }) => {
    try {
      const detail = await fetchPromo(params.slug);
      return {
        promo: toPromo(detail),
        products: detail.products.map(toProduct),
        categoryName: null as string | null,
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw notFound();
      throw err;
    }
  },
  notFoundComponent: () => (
    <>
      <Header />
      <main
        className="flex min-h-[60vh] items-center justify-center px-4 text-center"
        style={{ background: "var(--color-bg-cream)" }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              color: "var(--color-bg-dark)",
            }}
          >
            Акция не найдена
          </h1>
          <Link
            to="/promo"
            className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3"
            style={{
              background: "var(--color-bg-dark)",
              color: "var(--color-accent)",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={16} /> Все акции
          </Link>
        </div>
      </main>
      <Footer />
    </>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="p-10 text-center">
      <p>{(error as Error).message}</p>
      <button onClick={reset} className="mt-4 underline">
        Повторить
      </button>
    </div>
  ),
  component: PromoDetailPage,
});

function PromoDetailPage() {
  const data = Route.useLoaderData() as {
    promo: FrontPromo;
    products: ReturnType<typeof toProduct>[];
  };
  const promo = data.promo;
  const products = data.products;
  const { addToCart } = useCart();
  const trackRef = useRef<HTMLDivElement | null>(null);

  const category = promo.categoryFilter ? { name: "каталог раздела" } : undefined;

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const copyCode = async () => {
    if (!promo.promoCode) return;
    try {
      await navigator.clipboard.writeText(promo.promoCode);
      toast.success("Промокод скопирован", {
        icon: <Check size={16} />,
      });
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <>
      <Header />
      <main style={{ background: "var(--color-bg-cream)" }}>
        <PageHero
          eyebrow={promo.badge ?? "Акция"}
          title={promo.title}
          subtitle={promo.description}
          bgColor={promo.bgColor.includes("linear-gradient") ? "#8a5a1a" : promo.bgColor}
          accent={promo.accentColor}
        />

        <section className="mx-auto w-full max-w-5xl px-4 py-14 md:px-8 md:py-20">
          <Link
            to="/promo"
            className="inline-flex items-center gap-2 transition-opacity hover:opacity-70"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--color-bg-dark)",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={16} /> Все акции
          </Link>

          <div className="mt-10 grid gap-10 md:grid-cols-[1fr_320px]">
            <div>
              {promo.details?.map((para, i) => (
                <p
                  key={i}
                  className="mb-5"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 17,
                    lineHeight: 1.65,
                    color: "var(--color-text)",
                  }}
                >
                  {para}
                </p>
              ))}

              {promo.terms && promo.terms.length > 0 && (
                <div className="mt-10">
                  <h2
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 26,
                      fontWeight: 500,
                      color: "var(--color-bg-dark)",
                    }}
                  >
                    Условия акции
                  </h2>
                  <ul className="mt-4 space-y-3">
                    {promo.terms.map((t, i) => (
                      <li
                        key={i}
                        className="flex gap-3"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 16,
                          lineHeight: 1.55,
                          color: "var(--color-text)",
                        }}
                      >
                        <span
                          aria-hidden
                          className="mt-2 inline-block shrink-0 rounded-full"
                          style={{
                            width: 6,
                            height: 6,
                            background: "var(--color-accent-dark)",
                          }}
                        />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-4">
              {promo.promoCode && (
                <div
                  className="rounded-2xl border-2 border-dashed p-6 text-center"
                  style={{
                    borderColor: "var(--color-accent-dark)",
                    background: "rgba(232,180,79,0.10)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--color-accent-dark)",
                    }}
                  >
                    Промокод
                  </p>
                  <p
                    className="mt-2"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 34,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      color: "var(--color-bg-dark)",
                    }}
                  >
                    {promo.promoCode}
                  </p>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 transition-colors hover:bg-black/5"
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--color-bg-dark)",
                      border: "1px solid rgba(31,26,14,0.18)",
                    }}
                  >
                    <Copy size={14} /> Скопировать
                  </button>
                </div>
              )}

              <Link
                to="/catalog"
                search={promo.categoryFilter ? { category: promo.categoryFilter } : undefined}
                className="inline-flex items-center justify-between gap-2 rounded-2xl px-5 py-4 transition-transform hover:-translate-y-0.5"
                style={{
                  background: "var(--color-bg-dark)",
                  color: "var(--color-accent)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: "none",
                }}
              >
                <span>
                  Перейти в каталог
                  {category ? ` · ${category.name}` : ""}
                </span>
                <ArrowRight size={18} />
              </Link>

              {promo.validUntil && (
                <p
                  className="text-center"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    color: "rgba(31,26,14,0.6)",
                  }}
                >
                  Срок действия: {promo.validUntil}
                </p>
              )}
            </aside>
          </div>

          {products.length > 0 && (
            <section className="mt-16 md:mt-20">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--color-accent-dark)",
                    }}
                  >
                    Участвуют в акции
                  </span>
                  <h2
                    className="text-3xl md:text-4xl"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 500,
                      color: "var(--color-bg-dark)",
                      lineHeight: 1.05,
                    }}
                  >
                    Товары акции
                  </h2>
                </div>
                <div className="hidden gap-2 md:flex">
                  <button
                    type="button"
                    aria-label="Назад"
                    onClick={() => scrollBy(-1)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border hover:bg-black/5"
                    style={{
                      borderColor: "rgba(31,26,14,0.15)",
                      background: "#fffdf7",
                    }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Вперёд"
                    onClick={() => scrollBy(1)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border hover:bg-black/5"
                    style={{
                      borderColor: "rgba(31,26,14,0.15)",
                      background: "#fffdf7",
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div
                ref={trackRef}
                className="mt-6 grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-4 md:auto-cols-[minmax(260px,1fr)]"
                style={{ scrollSnapType: "x mandatory" }}
              >
                {products.map((p) => (
                  <div key={p.id} style={{ scrollSnapAlign: "start" }}>
                    <Link
                      to="/product/$slug"
                      params={{ slug: p.id }}
                      className="block"
                      style={{ textDecoration: "none" }}
                    >
                      <ProductCard product={p} onAdd={(prod) => addToCart(prod)} />
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
