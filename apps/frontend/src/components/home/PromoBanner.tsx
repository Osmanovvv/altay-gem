import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { PROMOS } from "@/data/promos";

const AUTOPLAY_MS = 5000;
const MotionLink = motion.create(Link);

export function PromoBanner() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(
    () => setIndex((i) => (i + 1) % PROMOS.length),
    [],
  );
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + PROMOS.length) % PROMOS.length),
    [],
  );

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(next, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, next]);

  const promo = PROMOS[index];

  return (
    <section
      id="promo"
      style={{
        backgroundColor: "var(--color-bg-cream)",
        padding: "40px 0 80px",
      }}
    >
      <div
        className="mx-auto max-w-7xl px-4 md:px-8"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 24,
            minHeight: 220,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <MotionLink
              key={promo.id}
              to="/promo/$slug"
              params={{ slug: promo.id }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="promo-card group relative flex cursor-pointer flex-col items-stretch overflow-hidden md:flex-row md:items-center"
              style={{
                background: promo.bgColor,
                minHeight: 220,
                textDecoration: "none",
                transition: "var(--transition-smooth)",
              }}
            >
              <img
                src={promo.image}
                alt={promo.imageAlt}
                width={960}
                height={540}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(105deg, rgba(15,30,24,0.88) 0%, rgba(15,30,24,0.74) 46%, rgba(15,30,24,0.36) 100%)",
                }}
              />
              {/* Shine overlay */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(80% 60% at 100% 0%, rgba(255,255,255,0.18), transparent 60%)",
                }}
              />

              {/* Text */}
              <div
                className="relative flex-1 px-6 py-8 md:px-12 md:py-12"
                style={{ color: promo.accentColor }}
              >
                {promo.badge && (
                  <span
                    className="inline-flex"
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      padding: "5px 11px",
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,0.18)",
                      backdropFilter: "blur(6px)",
                      color: promo.accentColor,
                    }}
                  >
                    {promo.badge}
                  </span>
                )}
                <h3
                  className="mt-4 text-3xl md:text-5xl"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    lineHeight: 1.05,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {promo.title}
                </h3>
                <p
                  className="mt-3 max-w-xl"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    lineHeight: 1.55,
                    opacity: 0.88,
                  }}
                >
                  {promo.description}
                </p>
                <span
                  className="mt-6 inline-flex items-center gap-2 rounded-full"
                  style={{
                    backgroundColor: promo.accentColor,
                    color:
                      promo.accentColor === "#e8b44f"
                        ? "var(--color-bg-dark)"
                        : "var(--color-bg-dark)",
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    fontSize: 14,
                    padding: "12px 22px",
                    minHeight: 44,
                  }}
                >
                  {promo.ctaText}
                  <ArrowRight size={16} />
                </span>
              </div>

            </MotionLink>
          </AnimatePresence>

          {/* Arrows */}
          <button
            type="button"
            onClick={prev}
            aria-label="Предыдущая акция"
            className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-white/30 md:flex"
            style={{
              width: 44,
              height: 44,
              backgroundColor: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(6px)",
              color: "var(--color-text-on-dark)",
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Следующая акция"
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-white/30 md:flex"
            style={{
              width: 44,
              height: 44,
              backgroundColor: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(6px)",
              color: "var(--color-text-on-dark)",
            }}
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Indicators */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {PROMOS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Перейти к акции ${i + 1}`}
              className="group inline-flex items-center justify-center"
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

export default PromoBanner;
