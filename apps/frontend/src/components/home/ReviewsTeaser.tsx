import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Quote, Star } from "lucide-react";
import { REVIEWS } from "@/data/reviews";

const AUTOPLAY_MS = 4000;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ReviewsTeaser() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % REVIEWS.length),
      AUTOPLAY_MS,
    );
    return () => window.clearInterval(id);
  }, [paused]);

  const r = REVIEWS[index];

  return (
    <section
      id="reviews"
      style={{
        backgroundColor: "var(--color-bg-cream)",
        padding: "80px 0",
      }}
    >
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="mb-10 flex flex-col items-center text-center">
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-accent-dark)",
            }}
          >
            Отзывы
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
            Нас рекомендуют
          </h2>
          <p
            className="mt-3"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 15,
              color: "var(--color-text-muted)",
            }}
          >
            Рейтинг <span style={{ color: "var(--color-accent-dark)", fontWeight: 600 }}>4,9</span> на{" "}
            <a href="#" style={{ color: "var(--color-text)", textDecoration: "underline" }}>
              Яндекс.Картах
            </a>{" "}
            и{" "}
            <a href="#" style={{ color: "var(--color-text)", textDecoration: "underline" }}>
              2ГИС
            </a>
          </p>
        </div>

        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="relative"
          style={{ minHeight: 260 }}
        >
          <AnimatePresence mode="wait">
            <motion.article
              key={r.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="relative mx-auto overflow-hidden"
              style={{
                maxWidth: 720,
                backgroundColor: "#fffdf7",
                borderRadius: 24,
                boxShadow: "var(--shadow-card)",
                padding: "36px 28px",
                border: "1px solid rgba(200,150,62,0.18)",
              }}
            >
              <Quote
                size={56}
                strokeWidth={1.2}
                className="absolute"
                style={{
                  top: 18,
                  right: 22,
                  color: "var(--color-accent)",
                  opacity: 0.25,
                }}
              />

              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={18}
                    fill={i < r.rating ? "var(--color-accent)" : "transparent"}
                    color="var(--color-accent)"
                    strokeWidth={1.5}
                  />
                ))}
              </div>

              <p
                className="mt-5"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 17,
                  lineHeight: 1.6,
                  color: "var(--color-text)",
                }}
              >
                {r.text}
              </p>

              <div className="mt-6 flex items-center gap-4">
                <div
                  className="flex shrink-0 items-center justify-center rounded-full"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: "var(--color-accent)",
                    color: "var(--color-bg-dark)",
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: 18,
                  }}
                >
                  {initials(r.name)}
                </div>
                <div className="flex-1">
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontWeight: 600,
                      fontSize: 15,
                      color: "var(--color-text)",
                    }}
                  >
                    {r.name}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 12.5,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {r.date} · {r.source}
                  </div>
                </div>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {REVIEWS.map((rv, i) => (
            <button
              key={rv.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Отзыв ${i + 1}`}
              className="inline-flex items-center justify-center"
              style={{ width: 44, height: 44 }}
            >
              <span
                style={{
                  display: "block",
                  height: 8,
                  width: i === index ? 28 : 8,
                  borderRadius: 999,
                  backgroundColor:
                    i === index
                      ? "var(--color-accent)"
                      : "rgba(31,26,14,0.2)",
                  transition: "var(--transition-smooth)",
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ReviewsTeaser;
