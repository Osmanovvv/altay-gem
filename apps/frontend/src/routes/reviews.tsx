import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Quote, Star } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/info/PageHero";
import { REVIEWS, type Review } from "@/data/reviews";

export const Route = createFileRoute("/reviews")({
  head: () => ({
    meta: [
      { title: "Отзывы покупателей - Жемчужина Алтая" },
      {
        name: "description",
        content:
          "Отзывы покупателей магазина Жемчужина Алтая на Яндекс.Картах и 2ГИС. Средний рейтинг 4,9.",
      },
      { property: "og:title", content: "Отзывы покупателей - Жемчужина Алтая" },
      {
        property: "og:description",
        content: "Рейтинг 4,9 на Яндекс.Картах и 2ГИС.",
      },
    ],
  }),
  component: ReviewsPage,
});

type Filter = "Все" | "Яндекс" | "2ГИС";
const FILTERS: Filter[] = ["Все", "Яндекс", "2ГИС"];

function ReviewsPage() {
  const [filter, setFilter] = useState<Filter>("Все");

  const filtered = useMemo<Review[]>(() => {
    if (filter === "Все") return REVIEWS;
    return REVIEWS.filter((r) => r.source === filter);
  }, [filter]);

  // Split into 2 columns manually for masonry feel on desktop
  const columns = useMemo(() => {
    const cols: Review[][] = [[], []];
    filtered.forEach((r, i) => cols[i % 2].push(r));
    return cols;
  }, [filtered]);

  return (
    <>
      <Header />
      <main style={{ background: "var(--color-bg-cream)" }}>
        <PageHero
          eyebrow="Отзывы"
          title="Отзывы покупателей"
          subtitle="Рейтинг 4,9 на Яндекс.Картах и 2ГИС. Спасибо каждому, кто делится впечатлениями."
        />

        <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count =
                f === "Все"
                  ? REVIEWS.length
                  : REVIEWS.filter((r) => r.source === f).length;
              const active = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 transition-colors"
                  style={{
                    background: active
                      ? "var(--color-bg-dark)"
                      : "rgba(31,26,14,0.06)",
                    color: active ? "var(--color-accent)" : "var(--color-text)",
                    border: `1px solid ${active ? "transparent" : "rgba(31,26,14,0.12)"}`,
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {f}
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{
                      background: active
                        ? "rgba(255,253,247,0.18)"
                        : "rgba(31,26,14,0.08)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Masonry grid (2 cols desktop, 1 col mobile via columns array) */}
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-5">
                <AnimatePresence mode="popLayout">
                  {col.map((r) => (
                    <motion.article
                      key={r.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      className="rounded-3xl bg-white p-7"
                      style={{
                        border: "1px solid rgba(31,26,14,0.08)",
                        boxShadow: "0 6px 24px -16px rgba(20,15,5,0.25)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Quote
                          size={22}
                          style={{ color: "var(--color-accent-dark)" }}
                        />
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1"
                          style={{
                            background:
                              r.source === "Яндекс"
                                ? "rgba(255,204,0,0.18)"
                                : "rgba(34,166,72,0.16)",
                            color:
                              r.source === "Яндекс" ? "#7a5a00" : "#1f5a2c",
                            fontFamily: "var(--font-body)",
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {r.source}
                        </span>
                      </div>

                      <div className="mt-3 flex gap-0.5">
                        {Array.from({ length: r.rating }).map((_, i) => (
                          <Star
                            key={i}
                            size={16}
                            fill="var(--color-accent-dark)"
                            color="var(--color-accent-dark)"
                          />
                        ))}
                      </div>

                      <p
                        className="mt-4"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 16,
                          lineHeight: 1.6,
                          color: "var(--color-text)",
                        }}
                      >
                        {r.text}
                      </p>

                      <div
                        className="mt-5 flex items-center justify-between"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 13,
                          color: "rgba(31,26,14,0.62)",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color: "var(--color-bg-dark)",
                          }}
                        >
                          {r.name}
                        </span>
                        <span>{r.date}</span>
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <p
              className="mt-10 text-center"
              style={{
                fontFamily: "var(--font-body)",
                color: "rgba(31,26,14,0.6)",
              }}
            >
              Отзывов пока нет.
            </p>
          )}

          {/* CTA block */}
          <div
            className="mt-16 overflow-hidden rounded-3xl p-8 md:p-12"
            style={{
              background:
                "linear-gradient(120deg, #1a3028 0%, #2d5a3f 100%)",
              color: "var(--color-text-on-dark)",
            }}
          >
            <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
              <div>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 500,
                    fontSize: 30,
                    lineHeight: 1.1,
                  }}
                >
                  Уже пробовали нашу продукцию?
                  <br /> Оставьте отзыв!
                </h2>
                <p
                  className="mt-3"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 16,
                    color: "rgba(255,253,247,0.74)",
                    maxWidth: 520,
                  }}
                >
                  Ваше мнение помогает нам становиться лучше и помогает другим
                  покупателям выбрать качественные товары с Алтая.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="#"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 transition-transform hover:-translate-y-0.5"
                  style={{
                    background: "var(--color-accent)",
                    color: "var(--color-bg-dark)",
                    fontFamily: "var(--font-body)",
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  Оставить на Яндекс
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 transition-colors hover:bg-white/10"
                  style={{
                    border: "1px solid rgba(255,253,247,0.3)",
                    color: "var(--color-text-on-dark)",
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  Оставить на 2ГИС
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
